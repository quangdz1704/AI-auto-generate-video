import { resolveReference } from "./voice.js";
import { EventEmitter } from "node:events";
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { StudioStore } from "./store.js";
import { loadConfig } from "../config.js";
import { getDurationSec } from "../assets/audio-tools.js";
import type { PipelineOptions } from "../render/template-pipeline.js";
import type { RenderJob } from "./schema.js";

interface Task {
  job: RenderJob;
  scriptPath: string;
  options: PipelineOptions;
}

export class RenderQueue extends EventEmitter {
  private tasks: Task[] = [];
  private active?: { task: Task; child: ChildProcess };
  private enqueuing = new Set<string>();
  constructor(
    private store: StudioStore,
    private root: string,
  ) {
    super();
  }

  async recover() {
    for (const project of await this.store.projects()) {
      if (
        project.jobs.some(
          (j) => j.status === "queued" || j.status === "running",
        )
      ) {
        await this.store.updateProject(project.id, (p) => {
          for (const job of p.jobs) {
            if (job.status === "queued" || job.status === "running")
              Object.assign(job, {
                status: "failed",
                error: "Ứng dụng đã khởi động lại. Hãy tạo lại video.",
                updatedAt: new Date().toISOString(),
              });
          }
        });
      }
    }
  }

  async enqueue(projectId: string) {
    if (this.enqueuing.has(projectId))
      throw new Error("Dự án đang được thêm vào hàng đợi.");
    this.enqueuing.add(projectId);
    try {
      return await this.prepare(projectId);
    } finally {
      this.enqueuing.delete(projectId);
    }
  }

  private async prepare(projectId: string) {
    const project = await this.store.project(projectId);
    if (!project) throw new Error("Không tìm thấy dự án.");
    if (
      project.jobs.some((j) => j.status === "running" || j.status === "queued")
    )
      throw new Error("Dự án này đang có video trong hàng đợi.");
    const settings = await this.store.settings();
    const job: RenderJob = {
      id: randomUUID(),
      projectId,
      status: "queued",
      progress: 0,
      stage: "queued",
      message: "Đang chờ lượt render",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const dir = join(this.store.projectDir(projectId), "runs", job.id);
    await mkdir(dir, { recursive: true });
    const script = structuredClone(project.draft.script);
    const reference = await resolveReference(this.store, script.voice);
    if (reference) {
      const { copyFile } = await import("node:fs/promises");
      const snapshot = join(
        dir,
        "reference" + (await import("node:path")).extname(reference),
      );
      await copyFile(reference, snapshot);
      script.voice.referenceAudio = basename(snapshot);
    }
    // Each render has an immutable script and isolated cache/output directory.
    for (const scene of script.scenes) {
      if (!project.draft.sfx)
        scene.sfx = { name: "none", volume: 0, startOffsetSec: 0 };
      const imageAsset = scene.inputs.imageAsset;
      if (typeof imageAsset === "string" && imageAsset) {
        const asset = await this.store.asset(imageAsset);
        if (asset.type !== "image")
          throw new Error("Cảnh này cần tài nguyên hình ảnh.");
        scene.inputs.image = `data:${asset.mime};base64,${(await readFile(join(this.store.root, "assets", asset.file))).toString("base64")}`;
        delete scene.inputs.imageAsset;
      }
    }
    const scriptPath = join(dir, "script.json");
    await writeFile(scriptPath, JSON.stringify(script, null, 2));
    const cfg = {
      ...loadConfig(),
      ttsProvider: script.voice.provider,
      omnivoiceEndpoint: settings.tts.omnivoiceEndpoint,
      vieneuEndpoint: settings.tts.vieneuEndpoint,
      vieneuVoice: undefined,
      ttsConcurrency: 1,
    };
    const options: PipelineOptions = {
      config: cfg,
      assetsDir: join(this.root, "assets", "sfx"),
      quality: project.draft.quality,
    };
    if (project.draft.musicAsset) {
      const asset = await this.store.asset(project.draft.musicAsset);
      if (asset.type !== "audio")
        throw new Error("Nhạc nền phải là tệp âm thanh.");
      options.backgroundMusic = {
        path: join(this.store.root, "assets", asset.file),
        volume: project.draft.musicVolume,
      };
    }
    await this.store.updateProject(projectId, (p) => {
      p.jobs.unshift(job);
    });
    this.tasks.push({ job, scriptPath, options });
    this.emit(projectId, job);
    this.next();
    return job;
  }

  private async patch(job: RenderJob, values: Partial<RenderJob>) {
    Object.assign(job, values, { updatedAt: new Date().toISOString() });
    await this.store.updateProject(job.projectId, (p) => {
      const index = p.jobs.findIndex((j) => j.id === job.id);
      if (index >= 0) p.jobs[index] = { ...job };
    });
    this.emit(job.projectId, { ...job });
  }

  private next() {
    if (this.active || !this.tasks.length) return;
    const task = this.tasks.shift()!;
    const js = fileURLToPath(new URL("./worker.js", import.meta.url));
    const worker = existsSync(js)
      ? js
      : fileURLToPath(new URL("./worker.ts", import.meta.url));
    const child = fork(worker, [], {
      execArgv: worker.endsWith(".ts") ? ["--import", "tsx"] : [],
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      detached: process.platform !== "win32",
    });
    this.active = { task, child };
    let error = "",
      chain = this.patch(task.job, {
        status: "running",
        stage: "starting",
        message: "Khởi động render",
        progress: 1,
      });
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", (data) => {
      error = (error + data.toString()).slice(-1500);
    });
    child.on("message", (message: any) => {
      if (message.type === "progress")
        chain = chain.then(() =>
          this.patch(task.job, {
            progress: Math.min(message.progress, 99),
            stage: message.stage,
            message: message.message,
          }),
        );
      if (message.type === "error") error = message.error;
    });
    child.on("error", (e) => {
      error = e.message;
    });
    child.once("close", async (code) => {
      try {
        await chain;
        if (task.job.status !== "cancelled") {
          if (
            code === 0 &&
            existsSync(join(this.runDir(task.job), "video.mp4"))
          ) {
            const duration = await getDurationSec(
              join(this.runDir(task.job), "video.mp4"),
            );
            await this.patch(task.job, {
              status: "completed",
              progress: 100,
              stage: "complete",
              message: "Video đã sẵn sàng",
              duration,
            });
          } else
            await this.patch(task.job, {
              status: "failed",
              stage: "failed",
              message: "Render chưa hoàn thành",
              error:
                error
                  .replace(/(?:sk-|key-)[\w-]+/g, "[redacted]")
                  .slice(-1000) || `Worker kết thúc với mã ${code}`,
            });
        }
      } catch (e) {
        console.error("Job persistence error", e);
      } finally {
        this.active = undefined;
        this.next();
      }
    });
    child.send({ scriptPath: task.scriptPath, options: task.options });
  }

  runDir(job: RenderJob) {
    return join(this.store.projectDir(job.projectId), "runs", job.id);
  }

  shutdown() {
    if (this.active) {
      try {
        if (process.platform !== "win32" && this.active.child.pid)
          process.kill(-this.active.child.pid, "SIGTERM");
        else this.active.child.kill();
      } catch {
        /* Already stopped. */
      }
    }
  }

  async cancel(projectId: string, id: string) {
    const project = await this.store.project(projectId);
    const job = project?.jobs.find((j) => j.id === id);
    if (!job || !["queued", "running"].includes(job.status))
      throw new Error("Không có lượt render đang chạy.");
    this.tasks = this.tasks.filter((task) => task.job.id !== id);
    if (this.active?.task.job.id === id) {
      this.active.task.job.status = "cancelled";
      try {
        if (process.platform !== "win32" && this.active.child.pid)
          process.kill(-this.active.child.pid, "SIGTERM");
        else this.active.child.kill();
      } catch {
        /* Already exited. */
      }
    }
    await this.patch(job, {
      status: "cancelled",
      stage: "cancelled",
      message: "Đã dừng theo yêu cầu",
    });
    return job;
  }
}
