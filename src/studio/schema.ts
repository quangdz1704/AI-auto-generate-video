import { z } from "zod";
import { TemplateScriptSchema } from "../render/template-script-schema.js";

export const SettingsSchema = z.object({
  ai: z
    .object({
      mode: z.enum(["cli", "api"]).default("cli"),
      cli: z.enum(["claude", "codex", "gemini"]).default("claude"),
      provider: z
        .enum(["openai", "anthropic", "google", "compatible"])
        .default("openai"),
      model: z.string().max(160).default(""),
      baseUrl: z.union([z.url(), z.literal("")]).default(""),
      apiKey: z.string().max(1000).default(""),
    })
    .default({
      mode: "cli",
      cli: "claude",
      provider: "openai",
      model: "",
      baseUrl: "",
      apiKey: "",
    }),
  tts: z
    .object({
      provider: z.enum(["omnivoice", "vieneu"]).default("vieneu"),
      omnivoiceEndpoint: z.url().default("http://127.0.0.1:8123"),
      vieneuEndpoint: z.url().default("http://127.0.0.1:8000"),
      voice: z.string().max(120).default(""),
      instructions: z
        .string()
        .max(500)
        .default("female, young adult, moderate pitch"),
    })
    .default({
      provider: "vieneu",
      omnivoiceEndpoint: "http://127.0.0.1:8123",
      vieneuEndpoint: "http://127.0.0.1:8000",
      voice: "",
      instructions: "female, young adult, moderate pitch",
    }),
  brand: z
    .object({
      channel: z.string().min(1).max(80).default("My Studio"),
      accent: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .default("#a5ee70"),
    })
    .default({ channel: "My Studio", accent: "#a5ee70" }),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type PublicSettings = Omit<Settings, "ai"> & {
  ai: Omit<Settings["ai"], "apiKey"> & { hasApiKey: boolean };
};

export const DraftSchema = z.object({
  title: z.string().min(1).max(200),
  sourceText: z.string().max(60000).default(""),
  sourceUrl: z.union([z.url(), z.literal("")]).default(""),
  script: TemplateScriptSchema,
  musicAsset: z.string().uuid().optional(),
  musicVolume: z.number().min(0).max(0.5).default(0.12),
  sfx: z.boolean().default(true),
  quality: z.enum(["draft", "standard", "high"]).default("standard"),
});
export type Draft = z.infer<typeof DraftSchema>;
export type JobStatus =
  "queued" | "running" | "completed" | "failed" | "cancelled";
export interface RenderJob {
  id: string;
  projectId: string;
  status: JobStatus;
  progress: number;
  stage: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
  duration?: number;
}
export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  draft: Draft;
  jobs: RenderJob[];
}
export interface Asset {
  id: string;
  name: string;
  type: "image" | "audio";
  mime: string;
  file: string;
  size: number;
}
export interface TemplateInfo {
  id: string;
  name: string;
  role: "hook" | "body" | "outro";
  description: string;
  color: string;
  defaults: Record<string, unknown>;
}
