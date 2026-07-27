import axios, { AxiosError } from "axios";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { TtsClient, TtsGenerateOptions } from "./tts-client.js";

export interface OmniVoiceOpts {
  endpoint: string; // e.g. "http://127.0.0.1:8123"
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * OpenAI-compatible OmniVoice server:
 * - voice design: POST /v1/audio/speech with JSON
 * - voice cloning: POST /v1/audio/speech/clone with multipart form data
 *
 * The server returns WAV by default. FFmpeg consumes it directly, then the
 * pipeline encodes the combined voice track as voice.mp3.
 */
export class OmniVoiceClient implements TtsClient {
  constructor(private cfg: OmniVoiceOpts) {}

  async generate(
    text: string,
    audioOutPath: string,
    options: TtsGenerateOptions = {},
  ): Promise<void> {
    const delays = [1000, 2000, 4000];
    let lastErr: unknown;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const resp = options.mode === "clone"
          ? await this.clone(text, options)
          : await this.design(text, options);
        await writeFile(audioOutPath, Buffer.from(resp.data));
        return;
      } catch (e) {
        lastErr = e;
        const status = (e as AxiosError).response?.status;
        if (status !== undefined && status < 500 && status !== 429) {
          throw new Error(`OmniVoice TTS failed (status ${status})`);
        }
        if (attempt < delays.length) await sleep(delays[attempt]);
      }
    }
    throw lastErr;
  }

  private design(text: string, options: TtsGenerateOptions) {
    return axios.post<ArrayBuffer>(
      `${this.cfg.endpoint}/v1/audio/speech`,
      {
        model: "omnivoice",
        input: text,
        response_format: "wav",
        ...(options.instructions ? { instructions: options.instructions } : {}),
        ...(options.voice ? { voice: options.voice } : {}),
        ...(options.speed !== undefined ? { speed: options.speed } : {}),
        ...(options.numStep !== undefined ? { num_step: options.numStep } : {}),
        ...(options.positionTemperature !== undefined
          ? { position_temperature: options.positionTemperature }
          : {}),
        ...(options.classTemperature !== undefined
          ? { class_temperature: options.classTemperature }
          : {}),
      },
      {
        headers: { "Content-Type": "application/json", Accept: "audio/wav" },
        responseType: "arraybuffer",
        timeout: 600000,
      },
    );
  }

  private async clone(text: string, options: TtsGenerateOptions) {
    if (!options.referenceAudioPath || !options.referenceText) {
      throw new Error(
        "Clone mode requires voice.referenceAudio and voice.referenceText in script.json",
      );
    }
    const form = new FormData();
    form.append("text", text);
    form.append("ref_text", options.referenceText);
    const audio = await readFile(options.referenceAudioPath);
    form.append(
      "ref_audio",
      new Blob([audio], { type: "audio/wav" }),
      basename(options.referenceAudioPath),
    );
    return axios.post<ArrayBuffer>(
      `${this.cfg.endpoint}/v1/audio/speech/clone`,
      form,
      {
        headers: { Accept: "audio/wav" },
        responseType: "arraybuffer",
        timeout: 600000,
      },
    );
  }
}
