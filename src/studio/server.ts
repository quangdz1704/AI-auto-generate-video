import { config } from "dotenv";
config({ path: ".env.local" });

import express, {
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import axios from "axios";
import { z } from "zod";
import { StudioStore } from "./store.js";
import {
  SettingsSchema,
  DraftSchema,
  type Project,
  type Asset,
} from "./schema.js";
import { templateCatalog, validTemplate } from "./catalog.js";
import {
  PAPER_STORY,
  timedComposition,
  estimateNarrationSeconds,
} from "../render/template-timing.js";
import { discoverModels } from "./models.js";
import { resolveReference } from "./voice.js";
import { scanAgents } from "./agents.js";
import { generateScript } from "./ai.js";
import { readArticle } from "./article.js";
import { RenderQueue } from "./jobs.js";
import { createTtsClient } from "../tts/tts-client.js";
import { loadConfig } from "../config.js";
import { getDurationSec } from "../assets/audio-tools.js";

export async function createStudioApp(
  root: string,
  dataDir = join(root, ".studio-data"),
) {
  const store = new StudioStore(dataDir);
  await store.init();
  const queue = new RenderQueue(store, root);
  await queue.recover();
  const templates = await templateCatalog(root);
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const host = req.get("host") ?? "";
    if (
      (!process.env.STUDIO_HOST || process.env.STUDIO_HOST === "127.0.0.1") &&
      !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)
    ) {
      res.status(403).json({ error: "Studio chỉ chấp nhận truy cập local." });
      return;
    }
    const origin = req.get("origin");
    if (
      origin &&
      new URL(origin).host !== host &&
      !["GET", "HEAD"].includes(req.method)
    ) {
      res.status(403).json({ error: "Yêu cầu phải đến từ giao diện Studio." });
      return;
    }
    next();
  });
  app.use(express.json({ limit: "30mb" }));

  const checkedDraft = async (body: unknown) => {
    const draft = DraftSchema.parse(body);
    const ids = new Set<string>();
    for (const scene of draft.script.scenes) {
      if (!/^[a-zA-Z0-9_-]{1,60}$/.test(scene.id) || ids.has(scene.id))
        throw new Error(
          "ID cảnh phải duy nhất, chỉ gồm chữ, số và dấu gạch ngang.",
        );
      ids.add(scene.id);
      if (!templates.some((t) => t.id === scene.templateId))
        throw new Error("Template không tồn tại trong thư viện.");
    }
    await resolveReference(store, draft.script.voice);
    return draft;
  };

  app.get("/api/settings", async (_req, res) =>
    res.json(store.publicSettings(await store.settings())),
  );
  app.put("/api/settings", async (req, res) => {
    const prev = await store.settings();
    const value = SettingsSchema.parse(req.body);
    if (
      req.body.ai?.apiKey === undefined &&
      value.ai.provider === prev.ai.provider &&
      value.ai.baseUrl === prev.ai.baseUrl
    )
      value.ai.apiKey = prev.ai.apiKey;
    await store.saveSettings(value);
    res.json(store.publicSettings(value));
  });
  app.get("/api/agents", async (_req, res) => res.json(await scanAgents()));
  app.post("/api/models", async (req, res) => {
    const saved = await store.settings();
    const ai = SettingsSchema.shape.ai.parse(req.body);
    if (
      req.body.apiKey === undefined &&
      ai.provider === saved.ai.provider &&
      ai.baseUrl === saved.ai.baseUrl
    )
      ai.apiKey = saved.ai.apiKey;
    res.json(await discoverModels(ai));
  });
  app.get("/api/templates", (_req, res) => res.json(templates));
  app.use(
    "/api/template-assets",
    express.static(join(root, "templates"), { index: false, dotfiles: "deny" }),
  );
  app.post("/api/templates/:id/preview", async (req, res) => {
    const template = templates.find((t) => t.id === req.params.id);
    if (!template || !validTemplate(template.id)) {
      res.sendStatus(404);
      return;
    }
    const aspect = req.body.aspect === "16:9" ? "16:9" : "9:16";
    let previewDuration: number | undefined;
    let inputs = {
      ...template.defaults,
      ...z.record(z.string(), z.unknown()).parse(req.body.inputs ?? {}),
    };
    if (template.id === PAPER_STORY) {
      const voiceText = z
        .string()
        .max(60000)
        .parse(req.body.voiceText ?? "");
      const seconds = estimateNarrationSeconds(
        voiceText || String(inputs.caption || ""),
      );
      previewDuration = seconds + 0.4;
      inputs = timedComposition(
        { templateId: template.id, inputs, voiceText },
        seconds,
        seconds + 0.4,
      ).inputs;
    }
    if (typeof inputs.imageAsset === "string" && inputs.imageAsset) {
      const asset = await store.asset(inputs.imageAsset);
      if (asset.type === "image")
        inputs.image = `data:${asset.mime};base64,${(await readFile(join(dataDir, "assets", asset.file))).toString("base64")}`;
    }
    const entry =
      aspect === "9:16" ? "compositions/portrait.html" : "index.html";
    let html = await readFile(
      join(root, "templates", template.id, entry),
      "utf8",
    );
    if (previewDuration)
      html = html.replace(
        /data-duration="[^"]+"/,
        `data-duration="${previewDuration}"`,
      );
    const data = JSON.stringify(inputs).replace(/</g, "\\u003c");
    const base = `/api/template-assets/${template.id}/${aspect === "9:16" ? "compositions/" : ""}`;
    html = html.replace(
      /<head>/i,
      `<head><base href="${base}"><script>window.__STUDIO_PREVIEW=true;window.__hyperframes={getVariables:()=>(${data})};</script>`,
    );
    res.type("html").send(html);
  });

  app.post("/api/source", async (req, res) =>
    res.json(await readArticle(z.url().parse(req.body.url))),
  );
  app.post("/api/generate", async (req, res) => {
    const input = z
      .object({
        text: z.string().min(20).max(60000),
        title: z.string().min(1).max(200),
        sourceUrl: z.union([z.url(), z.literal("")]).default(""),
        channel: z.string().min(1).max(80),
        aspect: z.enum(["9:16", "16:9"]),
        sceneCount: z.number().int().min(3).max(12),
      })
      .parse(req.body);
    const script = await generateScript({
      ...input,
      settings: await store.settings(),
      templates,
      scratch: join(dataDir, "scratch"),
    });
    res.json(script);
  });

  app.get("/api/tts/voices", async (req, res) => {
    const settings = await store.settings();
    const provider =
      req.query.provider === "omnivoice" ? "omnivoice" : "vieneu";
    const endpoint =
      provider === "vieneu"
        ? settings.tts.vieneuEndpoint
        : settings.tts.omnivoiceEndpoint;
    try {
      const response = await axios.get(
        `${endpoint.replace(/\/+$/, "")}/v1/voices`,
        {
          timeout: 5000,
          ...(provider === "vieneu" && process.env.VIENEU_API_KEY
            ? {
                headers: {
                  Authorization: `Bearer ${process.env.VIENEU_API_KEY}`,
                },
              }
            : {}),
        },
      );
      const data = response.data.data ?? response.data.voices ?? response.data;
      const voices = Array.isArray(data)
        ? data
            .filter((v: any) => v?.type !== "design")
            .map((v: any) =>
              typeof v === "string"
                ? { id: v, name: v }
                : {
                    id: v.id ?? v.name,
                    name: v.name ?? v.id,
                    description: v.description ?? "",
                  },
            )
            .filter((v: any) => v.id)
        : [];
      res.json({
        online: true,
        voices,
        capabilities: { design: provider === "omnivoice", clone: true },
      });
    } catch {
      res.json({
        online: false,
        voices: [],
        message: `Chưa kết nối được ${provider}. Bật TTS server hoặc kiểm tra địa chỉ ở Kết nối.`,
      });
    }
  });
  app.post("/api/tts/preview", async (req, res) => {
    const input = z
      .object({
        provider: z.enum(["vieneu", "omnivoice"]),
        voice: z.string().max(120).optional(),
        text: z.string().min(1).max(1000),
        mode: z.enum(["design", "clone"]).default("design"),
        referenceAudio: z.string().max(100).optional(),
        referenceText: z.string().max(5000).optional(),
        instructions: z.string().max(500).optional(),
        speed: z.number().min(0.5).max(2).default(1),
        numStep: z.number().int().min(1).max(64).optional(),
        positionTemperature: z.number().min(0).max(10).optional(),
        classTemperature: z.number().min(0).max(2).optional(),
      })
      .parse(req.body);
    const settings = await store.settings();
    const referenceAudioPath = await resolveReference(store, input);
    const file = join(dataDir, "scratch", `${randomUUID()}.wav`);
    await createTtsClient({
      ...loadConfig(),
      ttsProvider: input.provider,
      omnivoiceEndpoint: settings.tts.omnivoiceEndpoint,
      vieneuEndpoint: settings.tts.vieneuEndpoint,
      vieneuVoice: input.voice || undefined,
    }).generate(input.text, file, {
      mode: input.mode,
      referenceAudioPath,
      referenceText: input.referenceText,
      voice: input.voice || undefined,
      instructions: input.instructions,
      speed: input.speed,
      numStep: input.numStep,
      positionTemperature: input.positionTemperature,
      classTemperature: input.classTemperature,
    });
    res.type("audio/wav").send(await readFile(file));
    // Scratch files are private and may be removed after the response is buffered.
    const { unlink } = await import("node:fs/promises");
    await unlink(file);
  });

  app.get("/api/assets", async (_req, res) => res.json(await store.assets()));
  app.post("/api/assets", async (req, res) => {
    const input = z
      .object({
        name: z.string().min(1).max(200),
        data: z.string().max(28_000_000),
      })
      .parse(req.body);
    const match = input.data.match(
      /^data:([\w/+.-]+);base64,([A-Za-z0-9+/=\s]+)$/,
    );
    if (!match) throw new Error("Tệp upload không hợp lệ.");
    const bytes = Buffer.from(match[2], "base64");
    let mime = "",
      ext = "",
      type: Asset["type"] = "image";
    if (
      bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      mime = "image/png";
      ext = "png";
    } else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      mime = "image/jpeg";
      ext = "jpg";
    } else if (
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    ) {
      mime = "image/webp";
      ext = "webp";
    } else if (match[1].startsWith("audio/")) {
      type = "audio";
      if (
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WAVE"
      ) {
        mime = "audio/wav";
        ext = "wav";
      } else if (
        bytes.toString("ascii", 0, 3) === "ID3" ||
        (bytes[0] === 255 && (bytes[1] & 224) === 224)
      ) {
        mime = "audio/mpeg";
        ext = "mp3";
      } else if (bytes.toString("ascii", 4, 8) === "ftyp") {
        mime = "audio/mp4";
        ext = "m4a";
      }
    }
    if (!ext || bytes.length > (type === "image" ? 8_000_000 : 20_000_000))
      throw new Error(
        "Hỗ trợ PNG/JPG/WebP tối đa 8 MB, MP3/WAV/M4A tối đa 20 MB.",
      );
    const id = randomUUID(),
      file = `${id}.${ext}`;
    await writeFile(join(dataDir, "assets", file), bytes);
    if (type === "audio") {
      const duration = await getDurationSec(join(dataDir, "assets", file));
      if (!Number.isFinite(duration) || duration <= 0)
        throw new Error("Tệp âm thanh không có thời lượng hợp lệ.");
    }
    const asset: Asset = {
      id,
      name: input.name,
      file,
      mime,
      type,
      size: bytes.length,
    };
    await store.addAsset(asset);
    res.status(201).json(asset);
  });
  app.get("/api/assets/:id/file", async (req, res) => {
    const asset = await store.asset(req.params.id);
    res
      .type(asset.mime)
      .sendFile(resolve(dataDir, "assets", asset.file), { dotfiles: "allow" });
  });

  app.get("/api/projects", async (_req, res) => {
    res.json(
      (await store.projects()).map(({ draft, ...p }) => ({
        ...p,
        aspect: draft.script.aspect,
        scenes: draft.script.scenes.length,
      })),
    );
  });
  app.post("/api/projects", async (req, res) => {
    const draft = await checkedDraft(req.body);
    const project: Project = {
      id: randomUUID(),
      title: draft.title,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft,
      jobs: [],
    };
    await store.saveProject(project);
    res.status(201).json(project);
  });
  app.get("/api/projects/:id", async (req, res) => {
    const project = await store.project(req.params.id);
    if (!project) {
      res.sendStatus(404);
      return;
    }
    res.json(project);
  });
  app.put("/api/projects/:id", async (req, res) => {
    const draft = await checkedDraft(req.body);
    res.json(
      await store.updateProject(req.params.id, (p) => {
        p.title = draft.title;
        p.draft = draft;
      }),
    );
  });
  app.post("/api/projects/:id/render", async (req, res) =>
    res.status(202).json(await queue.enqueue(req.params.id)),
  );
  app.post("/api/projects/:id/jobs/:jobId/cancel", async (req, res) =>
    res.json(await queue.cancel(req.params.id, req.params.jobId)),
  );
  app.get("/api/projects/:id/events", async (req, res) => {
    const project = await store.project(req.params.id);
    if (!project) {
      res.sendStatus(404);
      return;
    }
    res.set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();
    const send = (job: unknown) =>
      res.write(`data: ${JSON.stringify(job)}\n\n`);
    project.jobs.forEach(send);
    queue.on(project.id, send);
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      queue.off(project.id, send);
    });
  });
  app.get("/api/projects/:id/runs/:jobId/:file", async (req, res) => {
    const project = await store.project(req.params.id);
    const job = project?.jobs.find(
      (j) => j.id === req.params.jobId && j.status === "completed",
    );
    const file = req.params.file;
    if (
      !job ||
      !["video.mp4", "voice.mp3", "script.txt", "script.json"].includes(file)
    ) {
      res.sendStatus(404);
      return;
    }
    const path = join(queue.runDir(job), file);
    if (req.query.download !== undefined)
      res.download(path, file, { dotfiles: "allow" });
    else res.sendFile(resolve(path), { dotfiles: "allow" });
  });
  app.get("/api/health", (_req, res) => res.json({ ok: true, mode: "local" }));

  const errors = (
    error: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction,
  ) => {
    if (res.headersSent) return;
    const message =
      error instanceof z.ZodError
        ? error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; ")
        : axios.isAxiosError(error)
          ? "Không kết nối được nguồn. Kiểm tra URL hoặc dán nội dung trực tiếp."
          : error instanceof Error
            ? error.message
            : "Có lỗi xảy ra. Hãy thử lại.";
    res.status(400).json({ error: message });
  };
  return { app, store, queue, errors };
}

async function main() {
  const root = process.cwd();
  const { app, errors, queue } = await createStudioApp(
    root,
    process.env.STUDIO_DATA_DIR
      ? resolve(process.env.STUDIO_DATA_DIR)
      : undefined,
  );
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "API không tồn tại." }),
  );
  app.use(errors);
  const production =
    !process.argv.includes("--dev") &&
    existsSync(join(root, "studio-dist", "index.html"));
  if (production) {
    app.use(express.static(join(root, "studio-dist")));
    app.get("/{*path}", (_req, res) =>
      res.sendFile(join(root, "studio-dist", "index.html")),
    );
  } else {
    const { createServer } = await import("vite");
    const vite = await createServer({
      configFile: join(root, "vite.config.ts"),
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }
  const port = Number(process.env.STUDIO_PORT ?? 4310);
  const server = app.listen(port, process.env.STUDIO_HOST ?? "127.0.0.1", () =>
    console.log(`\n  Video Studio → http://127.0.0.1:${port}\n`),
  );
  server.on("error", (e) => {
    console.error("Không mở được Studio:", e.message);
    process.exitCode = 1;
  });
  const shutdown = () => {
    queue.shutdown();
    server.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
