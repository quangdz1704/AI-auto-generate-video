import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { StudioStore } from "./store.js";
import { SettingsSchema, DraftSchema, type Project } from "./schema.js";
import { createStudioApp } from "./server.js";
import { RenderQueue } from "./jobs.js";
import { isPrivateAddress } from "./article.js";
import { parseScriptResponse } from "./ai.js";

const script = {
  version: "1.0",
  renderer: "hyperframes",
  aspect: "9:16",
  metadata: {
    title: "Câu chuyện",
    channel: "Studio",
    source: { url: "", domain: "local", image: null },
  },
  voice: { provider: "vieneu", speed: 1 },
  scenes: ["hook", "body", "outro"].map((type) => ({
    id: type,
    type,
    voiceText: "Xin chào Việt Nam.",
    templateId: "frame-photo-story",
    inputs: { headline: "Câu chuyện", subtitle: "Bắt đầu từ bạn" },
  })),
};
const makeDraft = () => DraftSchema.parse({ title: "Câu chuyện", script });
let dir: string;
let cleanupDir: string;
let store: StudioStore;
beforeEach(async () => {
  cleanupDir = await mkdtemp(join(tmpdir(), "studio-test-"));
  dir = join(cleanupDir, ".studio-data");
  store = new StudioStore(dir);
  await store.init();
});
afterEach(async () => {
  await rm(cleanupDir, { recursive: true, force: true });
});

describe("local settings and project repository", () => {
  it("encrypts the API key at rest, redacts it and loads it after restart", async () => {
    const settings = SettingsSchema.parse({
      ai: {
        mode: "api",
        apiKey: "private-fixture-key",
        model: "fixture-model",
      },
    });
    await store.saveSettings(settings);
    expect(await readFile(join(dir, "settings.json"), "utf8")).not.toContain(
      "private-fixture-key",
    );
    expect(store.publicSettings(settings).ai).not.toHaveProperty("apiKey");
    expect(store.publicSettings(settings).ai.hasApiKey).toBe(true);
    expect((await new StudioStore(dir).settings()).ai.apiKey).toBe(
      "private-fixture-key",
    );
    expect((await stat(join(dir, "local.key"))).mode & 0o777).toBe(0o600);
  });

  it("serializes concurrent project updates without losing jobs or edits", async () => {
    const p: Project = {
      id: randomUUID(),
      title: "Initial",
      createdAt: "",
      updatedAt: "",
      draft: makeDraft(),
      jobs: [],
    };
    await store.saveProject(p);
    await Promise.all([
      store.updateProject(p.id, (p) => {
        p.title = "Edited";
      }),
      store.updateProject(p.id, (p) => {
        p.jobs.push({
          id: randomUUID(),
          projectId: p.id,
          status: "queued",
          progress: 0,
          stage: "queued",
          message: "Wait",
          createdAt: "",
          updatedAt: "",
        });
      }),
    ]);
    const actual = await store.project(p.id);
    expect(actual?.title).toBe("Edited");
    expect(actual?.jobs).toHaveLength(1);
  });

  it("recovers interrupted render jobs without pretending they completed", async () => {
    const id = randomUUID();
    await store.saveProject({
      id,
      title: "Test",
      createdAt: "",
      updatedAt: "",
      draft: makeDraft(),
      jobs: [
        {
          id: randomUUID(),
          projectId: id,
          status: "running",
          progress: 70,
          stage: "render",
          message: "Rendering",
          createdAt: "",
          updatedAt: "",
        },
      ],
    });
    await new RenderQueue(store, process.cwd()).recover();
    const job = (await store.project(id))?.jobs[0];
    expect(job?.status).toBe("failed");
    expect(job?.error).toContain("khởi động lại");
  });

  it("rejects traversal in project IDs", () => {
    expect(() => store.projectDir("../../etc")).toThrow(/ID/);
  });
});

describe("Studio HTTP boundaries", () => {
  let server: Server;
  let url: string;
  beforeEach(async () => {
    const { app, errors } = await createStudioApp(process.cwd(), dir);
    app.use(errors);
    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const request = (path: string, method = "GET", value?: unknown) =>
    fetch(`${url}/api${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(value ? { body: JSON.stringify(value) } : {}),
    });

  it("persists selected CLI/API config without exposing or accidentally clearing the key", async () => {
    const settings = SettingsSchema.parse({
      ai: {
        mode: "api",
        provider: "compatible",
        baseUrl: "http://127.0.0.1:11434/v1",
        apiKey: "secret-for-test",
        model: "local-test-model",
      },
    });
    const saved = await (await request("/settings", "PUT", settings)).json();
    expect(saved.ai.hasApiKey).toBe(true);
    expect(saved.ai.apiKey).toBeUndefined();
    await request("/settings", "PUT", saved);
    expect((await store.settings()).ai.apiKey).toBe("secret-for-test");
    await request("/settings", "PUT", {
      ...saved,
      ai: { ...saved.ai, baseUrl: "http://127.0.0.1:9999/v1" },
    });
    expect((await store.settings()).ai.apiKey).toBe("");
  });

  it("creates, edits and reopens a project", async () => {
    const response = await request("/projects", "POST", makeDraft());
    expect(response.status).toBe(201);
    const project = await response.json();
    const draft = { ...project.draft, title: "Updated story" };
    expect(
      (await request(`/projects/${project.id}`, "PUT", draft)).status,
    ).toBe(200);
    expect(
      (await (await request(`/projects/${project.id}`)).json()).title,
    ).toBe("Updated story");
    const list = await (await request("/projects")).json();
    expect(list[0].scenes).toBe(3);
    expect(list[0].draft).toBeUndefined();
  });

  it("keeps project voice separate from defaults and only accepts uploaded clone audio", async () => {
    const draft = makeDraft();
    draft.script.voice = {
      provider: "vieneu",
      mode: "clone",
      speed: 1,
      referenceAudio: "/etc/passwd",
      referenceText: "Xin chào.",
    };
    expect((await request("/projects", "POST", draft)).status).toBe(400);
    expect(
      (
        await request("/tts/preview", "POST", {
          ...draft.script.voice,
          text: "Test",
        })
      ).status,
    ).toBe(400);
    const id = randomUUID();
    await store.addAsset({
      id,
      name: "Sample",
      file: `${id}.wav`,
      type: "audio",
      mime: "audio/wav",
      size: 100,
    });
    draft.script.voice.referenceAudio = `asset:${id}`;
    const defaults = await store.settings();
    const response = await request("/projects", "POST", draft);
    expect(response.status).toBe(201);
    expect((await response.json()).draft.script.voice.mode).toBe("clone");
    expect((await store.settings()).tts).toEqual(defaults.tts);
  });

  it.each(["../../unsafe", "hook"])(
    "rejects unsafe or duplicate scene IDs (%s)",
    async (id) => {
      const draft = makeDraft();
      draft.script.scenes[1].id = id;
      expect((await request("/projects", "POST", draft)).status).toBe(400);
    },
  );

  it("rejects a missing template before enqueueing render", async () => {
    const draft = makeDraft();
    draft.script.scenes[0].templateId = "../../outside";
    expect((await request("/projects", "POST", draft)).status).toBe(400);
  });

  it("previews a real template without turning input text into script tags", async () => {
    const response = await request(
      "/templates/frame-photo-story/preview",
      "POST",
      {
        aspect: "9:16",
        inputs: { headline: "</script><script>window.unsafe=true</script>" },
      },
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("window.__hyperframes");
    expect(html).toContain("\\u003c/script>");
    expect(html).not.toContain("<script>window.unsafe");
  });

  it("previews paper captions from current narration with enough timeline duration", async () => {
    const voiceText = "Một câu chuyện dài cần có đủ thời gian để đọc. ".repeat(
      5,
    );
    const response = await request(
      "/templates/frame-paper-story/preview",
      "POST",
      { aspect: "9:16", voiceText, inputs: { headline: "Câu chuyện" } },
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(JSON.stringify(voiceText));
    expect(Number(html.match(/data-duration="([^"]+)"/)?.[1])).toBeGreaterThan(
      8,
    );
    expect(html).toContain("window.__STUDIO_PREVIEW=true");
    expect(html).toContain("../assets/sketch-scenes.png");
  });

  it("validates and stores uploaded images, rejecting SVG/HTML", async () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jA1sAAAAASUVORK5CYII=";
    const response = await request("/assets", "POST", {
      name: "picture.png",
      data: png,
    });
    expect(response.status).toBe(201);
    const asset = await response.json();
    expect(
      (await request(`/assets/${asset.id}/file`)).headers.get("content-type"),
    ).toContain("image/png");
    const bad = await request("/assets", "POST", {
      name: "bad.svg",
      data: `data:image/svg+xml;base64,${Buffer.from('<svg onload="alert(1)"></svg>').toString("base64")}`,
    });
    expect(bad.status).toBe(400);
  });

  it("blocks cross-origin writes to the local app", async () => {
    const response = await fetch(`${url}/api/settings`, {
      method: "PUT",
      headers: {
        Origin: "https://unrelated.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    expect(response.status).toBe(403);
  });

  it("serves completed output from a hidden data directory with ranges and downloads", async () => {
    const id = randomUUID(),
      jobId = randomUUID();
    await store.saveProject({
      id,
      title: "Completed fixture",
      createdAt: "",
      updatedAt: "",
      draft: makeDraft(),
      jobs: [
        {
          id: jobId,
          projectId: id,
          status: "completed",
          progress: 100,
          stage: "complete",
          message: "Done",
          createdAt: "",
          updatedAt: "",
        },
      ],
    });
    const runDir = join(store.projectDir(id), "runs", jobId);
    await mkdir(runDir, { recursive: true });
    await writeFile(join(runDir, "video.mp4"), Buffer.from("0123456789"));
    const path = `${url}/api/projects/${id}/runs/${jobId}/video.mp4`;
    const range = await fetch(path, { headers: { Range: "bytes=0-3" } });
    expect(range.status).toBe(206);
    expect(range.headers.get("content-type")).toContain("video/mp4");
    expect(await range.text()).toBe("0123");
    const download = await fetch(path + "?download=1");
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain("attachment");
  });
});

it("parses fenced AI JSON and still validates required script structure", () => {
  expect(
    parseScriptResponse(`\`\`\`json\n${JSON.stringify(script)}\n\`\`\``).scenes,
  ).toHaveLength(3);
  expect(() => parseScriptResponse("not a script")).toThrow(/JSON/);
  expect(() => parseScriptResponse('{"scenes":[]}')).toThrow();
});

it("blocks private/link-local source URLs while allowing public article addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.2",
    "192.168.1.2",
    "172.16.0.2",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "fe80::1",
  ])
    expect(isPrivateAddress(ip)).toBe(true);
  expect(isPrivateAddress("8.8.8.8")).toBe(false);
});
