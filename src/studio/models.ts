import axios from "axios";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Settings } from "./schema.js";
import { scanAgents } from "./agents.js";

export interface ModelOption {
  id: string;
  name: string;
  description?: string;
}
export function normalizeModels(data: any, google = false): ModelOption[] {
  const rows = data.data ?? data.models ?? [];
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.flatMap((m: any) => {
    const id = String(m.id ?? m.name ?? "").replace(/^models\//, "");
    if (
      !id ||
      seen.has(id) ||
      (google && !m.supportedGenerationMethods?.includes("generateContent"))
    )
      return [];
    seen.add(id);
    return [
      {
        id,
        name: String(m.display_name ?? m.displayName ?? id),
        description: id,
      },
    ];
  });
}
export async function discoverModels(ai: Settings["ai"]) {
  if (ai.mode === "cli") {
    const agent = (await scanAgents()).find((a) => a.id === ai.cli);
    if (!agent?.available)
      throw new Error("Chưa tìm thấy CLI trên máy chạy Studio.");
    if (ai.cli === "codex") {
      try {
        // Read only catalog metadata, never CLI credentials or session history.
        const cache = JSON.parse(
          await readFile(
            join(
              process.env.CODEX_HOME || join(homedir(), ".codex"),
              "models_cache.json",
            ),
            "utf8",
          ),
        );
        const models: ModelOption[] = cache.models
          .filter((m: any) => m.visibility === "list")
          .map((m: any) => ({
            id: m.slug,
            name: m.display_name || m.slug,
            description: m.description || m.slug,
          }));
        if (models.length)
          return {
            models,
            source: "Danh mục cache của Codex CLI trên máy",
            updatedAt: cache.fetched_at,
          };
      } catch {
        /* Explain how to populate it below. */
      }
      return {
        models: [],
        source:
          "Chưa có danh mục local. Mở Codex CLI một lần để cập nhật danh sách model.",
      };
    }
    if (ai.cli === "claude")
      return {
        models: ["sonnet", "opus", "haiku"].map((id) => ({
          id,
          name: id[0].toUpperCase() + id.slice(1),
          description: "Alias do Claude Code tự phân giải theo tài khoản",
        })),
        source:
          "Alias của Claude Code; CLI không cung cấp API liệt kê model theo tài khoản.",
      };
    return {
      models: [],
      source:
        "Gemini CLI chưa cung cấp danh mục local. Có thể nhập model ID tuỳ chỉnh.",
    };
  }
  const google = ai.provider === "google",
    anthropic = ai.provider === "anthropic";
  const base = (
    ai.baseUrl ||
    (google
      ? "https://generativelanguage.googleapis.com/v1beta"
      : anthropic
        ? "https://api.anthropic.com/v1"
        : "https://api.openai.com/v1")
  ).replace(/\/+$/, "");
  if (!ai.apiKey && ai.provider !== "compatible")
    throw new Error("Nhập API key trước khi quét model.");
  const headers: Record<string, string> = google
    ? { "x-goog-api-key": ai.apiKey }
    : anthropic
      ? { "x-api-key": ai.apiKey, "anthropic-version": "2023-06-01" }
      : ai.apiKey
        ? { Authorization: `Bearer ${ai.apiKey}` }
        : {};
  const models: ModelOption[] = [];
  let cursor: string | undefined;
  try {
    for (let page = 0; page < 20; page++) {
      const params = google
        ? { pageSize: 1000, ...(cursor ? { pageToken: cursor } : {}) }
        : anthropic
          ? { limit: 1000, ...(cursor ? { after_id: cursor } : {}) }
          : {};
      const { data } = await axios.get(`${base}/models`, {
        headers,
        params,
        timeout: 10000,
        maxRedirects: 0,
        maxContentLength: 4_000_000,
      });
      models.push(...normalizeModels(data, google));
      cursor = google
        ? data.nextPageToken
        : anthropic && data.has_more
          ? data.last_id
          : undefined;
      if (!cursor) break;
    }
  } catch {
    throw new Error(
      "Không lấy được danh sách model. Kiểm tra API key, quyền truy cập và Base URL.",
    );
  }
  return {
    models: [...new Map(models.map((m) => [m.id, m])).values()],
    source: "Danh sách trả về từ API đang chọn",
  };
}
