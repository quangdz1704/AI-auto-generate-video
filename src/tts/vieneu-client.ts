import axios from "axios";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type { TtsClient, TtsGenerateOptions } from "./tts-client.js";

export interface VieNeuOpts {
  /** Server root, without /v1, e.g. http://127.0.0.1:8000. */
  endpoint: string;
  /** Preset ID from GET /v1/voices; omit to use the server's default voice. */
  voice?: string;
  apiKey?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** VieNeu-TTS v3 Turbo returns WAV; FFmpeg encodes the final voice.mp3. */
export class VieNeuClient implements TtsClient {
  private clones = new Map<string, Promise<string>>();
  constructor(private cfg: VieNeuOpts) {}

  private async enroll(path: string) {
    const bytes = await readFile(path);
    const name = `studio-${createHash("sha256").update(bytes).digest("hex").slice(0, 20)}`;
    let pending = this.clones.get(name);
    if (!pending) {
      pending = (async () => {
        const form = new FormData();
        form.append("name", name);
        form.append("file", new Blob([bytes]), basename(path));
        try {
          await axios.post(
            `${this.cfg.endpoint.replace(/\/+$/, "")}/v1/voices`,
            form,
            {
              timeout: 120000,
              headers: this.cfg.apiKey
                ? { Authorization: `Bearer ${this.cfg.apiKey}` }
                : {},
            },
          );
          return name;
        } catch {
          throw new Error(
            "VieNeu could not enroll reference audio via POST /v1/voices. Check server support and use a clear 3–8 second speech sample.",
          );
        }
      })();
      this.clones.set(name, pending);
      pending.catch(() => this.clones.delete(name));
    }
    return pending;
  }

  async generate(
    text: string,
    audioOutPath: string,
    options: TtsGenerateOptions = {},
  ): Promise<void> {
    if (options.mode === "clone" && !options.referenceAudioPath)
      throw new Error("Clone requires reference audio for POST /v1/voices.");
    const url = `${this.cfg.endpoint.replace(/\/+$/, "")}/v1/audio/speech`;
    const voice =
      options.mode === "clone"
        ? await this.enroll(options.referenceAudioPath!)
        : (this.cfg.voice ?? options.voice);
    const delays = [1000, 2000, 4000];

    for (let attempt = 0; ; attempt++) {
      try {
        const resp = await axios.post<ArrayBuffer>(
          url,
          {
            model: "vieneu-v3-turbo",
            input: text,
            response_format: "wav",
            ...(voice ? { voice } : {}),
          },
          {
            headers: {
              "Content-Type": "application/json",
              Accept: "audio/wav",
              ...(this.cfg.apiKey
                ? { Authorization: `Bearer ${this.cfg.apiKey}` }
                : {}),
            },
            responseType: "arraybuffer",
            timeout: 600000,
          },
        );
        const audio = Buffer.from(resp.data);
        // Reject JSON/HTML errors or an empty streaming WAV before caching it.
        if (
          audio.length <= 44 ||
          audio.toString("ascii", 0, 4) !== "RIFF" ||
          audio.toString("ascii", 8, 12) !== "WAVE"
        ) {
          throw new Error("VieNeu returned invalid or empty WAV audio");
        }
        // The server's 44-byte streaming header uses unknown sizes. Once the
        // response is complete, finalize them for desktop players like afplay.
        if (
          audio.readUInt32LE(4) === 0xffffffff &&
          audio.toString("ascii", 36, 40) === "data" &&
          audio.readUInt32LE(40) === 0xffffffff
        ) {
          audio.writeUInt32LE(audio.length - 8, 4);
          audio.writeUInt32LE(audio.length - 44, 40);
        }
        await writeFile(audioOutPath, audio);
        return;
      } catch (e) {
        // Retry transient HTTP/connection failures, not bad input or file errors.
        if (!axios.isAxiosError(e)) throw e;
        const status = e.response?.status;
        if (
          attempt < delays.length &&
          (status === undefined || status === 429 || status >= 500)
        ) {
          await sleep(delays[attempt]);
          continue;
        }
        // Don't propagate Axios' config, which may contain the API key.
        throw new Error(
          status === undefined
            ? `VieNeu TTS connection failed (${e.code ?? "network error"}). Start the server at ${this.cfg.endpoint}; see docs/vieneu.md.`
            : `VieNeu TTS failed (status ${status}). Check VIENEU_VOICE via GET /v1/voices and VIENEU_API_KEY if configured.`,
        );
      }
    }
  }
}
