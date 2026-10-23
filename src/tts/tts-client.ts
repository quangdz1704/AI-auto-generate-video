/**
 * Common TTS client interface for the local OmniVoice and VieNeu servers.
 */
export interface TtsClient {
  /**
   * Generate speech audio for `text` and write it to `audioOutPath`.
   */
  generate(
    text: string,
    audioOutPath: string,
    options?: TtsGenerateOptions,
  ): Promise<void>;
}

/** Per-video voice settings; VieNeu supports presets and reference cloning, not voice design. */
export interface TtsGenerateOptions {
  /** `design` generates from attributes; `clone` uses an authorized recording. */
  mode?: "design" | "clone";
  /** e.g. "female, young adult, moderate pitch". Takes priority over a preset. */
  instructions?: string;
  /** OpenAI-style preset supported by the server, e.g. "nova" or "onyx". */
  voice?: string;
  speed?: number;
  /** Inference steps (1–64); more steps favour quality over speed. */
  numStep?: number;
  /** Use 0 to keep the designed voice reproducible across scenes. */
  positionTemperature?: number;
  /** Use 0 to keep token selection reproducible across scenes. */
  classTemperature?: number;
  /** Required in clone mode: absolute path to an authorized reference recording. */
  referenceAudioPath?: string;
  /** Required in clone mode: transcript of the reference recording. */
  referenceText?: string;
}

import type { Config } from "../config.js";
import { OmniVoiceClient } from "./omnivoice-client.js";
import { VieNeuClient } from "./vieneu-client.js";

export function createTtsClient(cfg: Config): TtsClient {
  if (cfg.ttsProvider === "vieneu") {
    return new VieNeuClient({
      endpoint: cfg.vieneuEndpoint,
      voice: cfg.vieneuVoice,
      apiKey: cfg.vieneuApiKey,
    });
  }
  return new OmniVoiceClient({ endpoint: cfg.omnivoiceEndpoint });
}
