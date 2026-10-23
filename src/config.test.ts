import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./config.js";

const ENV_KEYS = [
  "TTS_PROVIDER", "OMNIVOICE_ENDPOINT", "TTS_CONCURRENCY",
  "VIENEU_ENDPOINT", "VIENEU_VOICE", "VIENEU_API_KEY",
];

describe("loadConfig", () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    ENV_KEYS.forEach((k) => delete process.env[k]);
  });

  afterEach(() => {
    Object.entries(saved).forEach(([k, v]) => {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    });
  });

  it("defaults to omnivoice with sensible defaults", () => {
    const cfg = loadConfig();
    expect(cfg.ttsProvider).toBe("omnivoice");
    expect(cfg.omnivoiceEndpoint).toBe("http://127.0.0.1:8123");
    expect(cfg.ttsConcurrency).toBe(1);
  });

  it("respects OMNIVOICE_ENDPOINT override", () => {
    process.env.OMNIVOICE_ENDPOINT = "http://localhost:9000";
    const cfg = loadConfig();
    expect(cfg.omnivoiceEndpoint).toBe("http://localhost:9000");
  });

  it("selects VieNeu from the script when there is no environment override", () => {
    expect(loadConfig("vieneu").ttsProvider).toBe("vieneu");
  });

  it("lets TTS_PROVIDER override a script for comparisons", () => {
    process.env.TTS_PROVIDER = "vieneu";
    expect(loadConfig("omnivoice").ttsProvider).toBe("vieneu");
    process.env.TTS_PROVIDER = "omnivoice";
    expect(loadConfig("vieneu").ttsProvider).toBe("omnivoice");
  });

  it("defaults VieNeu to a local server with its default voice and no key", () => {
    const cfg = loadConfig("vieneu");
    expect(cfg.vieneuEndpoint).toBe("http://127.0.0.1:8000");
    expect(cfg.vieneuVoice).toBeUndefined();
    expect(cfg.vieneuApiKey).toBeUndefined();
  });

  it("respects VieNeu endpoint, voice and optional key", () => {
    process.env.VIENEU_ENDPOINT = "http://localhost:9001";
    process.env.VIENEU_VOICE = " Mai Anh ";
    process.env.VIENEU_API_KEY = "test-key";
    const cfg = loadConfig("vieneu");
    expect(cfg.vieneuEndpoint).toBe("http://localhost:9001");
    expect(cfg.vieneuVoice).toBe("Mai Anh");
    expect(cfg.vieneuApiKey).toBe("test-key");
  });

  it("rejects unsupported providers", () => {
    process.env.TTS_PROVIDER = "elevenlabs";
    expect(() => loadConfig()).toThrow(/TTS_PROVIDER/);
  });
});
