import { mkdir, readFile, readdir, writeFile, rename } from "node:fs/promises";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { join } from "node:path";
import {
  SettingsSchema,
  type Settings,
  type PublicSettings,
  type Project,
  type Asset,
} from "./schema.js";

export class StudioStore {
  private updates = new Map<string, Promise<unknown>>();
  private assetWrites: Promise<void> = Promise.resolve();
  constructor(readonly root: string) {}

  async init() {
    for (const folder of ["", "projects", "assets", "scratch"]) {
      await mkdir(join(this.root, folder), { recursive: true, mode: 0o700 });
    }
    try {
      await writeFile(join(this.root, "local.key"), randomBytes(32), {
        flag: "wx",
        mode: 0o600,
      });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }

  async json<T>(file: string): Promise<T | undefined> {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw e;
    }
  }

  async save(file: string, value: unknown) {
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temp, file);
  }

  async settings(): Promise<Settings> {
    const stored = await this.json<Record<string, any>>(
      join(this.root, "settings.json"),
    );
    if (!stored) return SettingsSchema.parse({});
    const value = structuredClone(stored);
    if (value.encryptedKey) {
      const [iv, tag, data] = value.encryptedKey
        .split(":")
        .map((s: string) => Buffer.from(s, "hex"));
      const cipher = createDecipheriv(
        "aes-256-gcm",
        await readFile(join(this.root, "local.key")),
        iv,
      );
      cipher.setAuthTag(tag);
      value.ai.apiKey = Buffer.concat([
        cipher.update(data),
        cipher.final(),
      ]).toString("utf8");
    }
    return SettingsSchema.parse(value);
  }

  async saveSettings(settings: Settings) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      await readFile(join(this.root, "local.key")),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(settings.ai.apiKey, "utf8"),
      cipher.final(),
    ]);
    await this.save(join(this.root, "settings.json"), {
      ...settings,
      ai: { ...settings.ai, apiKey: "" },
      encryptedKey: [iv, cipher.getAuthTag(), encrypted]
        .map((b) => b.toString("hex"))
        .join(":"),
    });
  }

  publicSettings(settings: Settings): PublicSettings {
    const { apiKey, ...ai } = settings.ai;
    return { ...settings, ai: { ...ai, hasApiKey: !!apiKey } };
  }

  projectDir(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("ID dự án không hợp lệ.");
    return join(this.root, "projects", id);
  }
  async project(id: string) {
    return this.json<Project>(join(this.projectDir(id), "project.json"));
  }
  async saveProject(project: Project) {
    await mkdir(this.projectDir(project.id), { recursive: true });
    await this.save(join(this.projectDir(project.id), "project.json"), project);
  }
  async updateProject(id: string, update: (project: Project) => void) {
    const pending = (this.updates.get(id) ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const project = await this.project(id);
        if (!project) throw new Error("Không tìm thấy dự án.");
        update(project);
        project.updatedAt = new Date().toISOString();
        await this.saveProject(project);
        return project;
      });
    this.updates.set(id, pending);
    try {
      return await pending;
    } finally {
      if (this.updates.get(id) === pending) this.updates.delete(id);
    }
  }
  async projects() {
    const entries = await readdir(join(this.root, "projects"));
    const projects = await Promise.all(entries.map((id) => this.project(id)));
    return projects
      .filter((p): p is Project => !!p)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async assets() {
    return (await this.json<Asset[]>(join(this.root, "assets.json"))) ?? [];
  }
  async addAsset(asset: Asset) {
    const pending = this.assetWrites.then(async () => {
      const assets = await this.assets();
      await this.save(join(this.root, "assets.json"), [asset, ...assets]);
    });
    this.assetWrites = pending.catch(() => {});
    await pending;
  }
  async asset(id: string) {
    const asset = (await this.assets()).find((a) => a.id === id);
    if (!asset) throw new Error("Không tìm thấy tài nguyên.");
    return asset;
  }
}
