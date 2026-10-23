import { config } from "dotenv";
config({ path: ".env.local" });

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { loadConfig } from "./config.js";
import { createTtsClient } from "./tts/tts-client.js";
import { log } from "./utils/logger.js";

async function main() {
  const cfg = loadConfig();
  const text = process.argv[2] ?? "Xin chào! Đây là bản thử giọng đọc tiếng Việt cho video tin tức của bạn.";
  const out = process.argv[3] ?? join("output", "tts-preview", `${cfg.ttsProvider}.wav`);
  if (!text.trim() || !out.toLowerCase().endsWith(".wav")) {
    throw new Error('Usage: npm run tts:preview -- "Vietnamese text" [output.wav]');
  }
  await mkdir(dirname(out), { recursive: true });
  log.info(`Preview TTS: ${cfg.ttsProvider}`);
  await createTtsClient(cfg).generate(text, out);
  console.log(`Audio: ${out}`);
}

main().catch((err) => {
  log.error("TTS preview failed", err);
  process.exitCode = 1;
});
