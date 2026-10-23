import { afterEach, beforeEach, describe, expect, it } from "vitest";
import nock from "nock";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VieNeuClient } from "./vieneu-client.js";
import { OmniVoiceClient } from "./omnivoice-client.js";
import { createTtsClient } from "./tts-client.js";
import type { Config } from "../config.js";

// Streaming WAV with unknown sizes, as emitted by apps.openai_speech.
const wav = Buffer.alloc(46);
wav.write("RIFF");
wav.writeUInt32LE(0xffffffff, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(48000, 24);
wav.writeUInt32LE(96000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(0xffffffff, 40);

let dir: string;
let out: string;
beforeEach(() => {
  nock.disableNetConnect();
  dir = mkdtempSync(join(tmpdir(), "vieneu-"));
  out = join(dir, "scene.wav");
});
afterEach(() => {
  nock.cleanAll();
  nock.enableNetConnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("VieNeuClient", () => {
  it("sends Vietnamese text with the script's voice and finalizes the streaming WAV header", async () => {
    const scope = nock("http://127.0.0.1:8000", {
      reqheaders: { accept: "audio/wav" },
      badheaders: ["authorization"],
    })
      .post("/v1/audio/speech", {
        model: "vieneu-v3-turbo",
        input: "Xin chào Việt Nam!",
        voice: "Mai Anh",
        response_format: "wav",
      })
      .reply(200, wav, { "Content-Type": "audio/wav" });
    await new VieNeuClient({ endpoint: "http://127.0.0.1:8000/" }).generate(
      "Xin chào Việt Nam!",
      out,
      { voice: "Mai Anh", speed: 1.2, instructions: "female" },
    );
    expect(scope.isDone()).toBe(true);
    const saved = readFileSync(out);
    expect(saved.readUInt32LE(4)).toBe(saved.length - 8);
    expect(saved.readUInt32LE(40)).toBe(saved.length - 44);
    expect(saved.subarray(44)).toEqual(wav.subarray(44));
  });

  it("lets the configured voice override the script and sends optional Bearer auth", async () => {
    const scope = nock("http://127.0.0.1:8000", {
      reqheaders: { authorization: "Bearer test-key" },
    })
      .post("/v1/audio/speech", (body) => body.voice === "Mai Anh")
      .reply(200, wav);
    await new VieNeuClient({
      endpoint: "http://127.0.0.1:8000",
      voice: "Mai Anh",
      apiKey: "test-key",
    }).generate("Xin chào.", out, { voice: "another-voice" });
    expect(scope.isDone()).toBe(true);
  });

  it("omits the voice field when using the server's default voice", async () => {
    const scope = nock("http://127.0.0.1:8000")
      .post("/v1/audio/speech", (body) => !("voice" in body))
      .reply(200, wav);
    await new VieNeuClient({ endpoint: "http://127.0.0.1:8000" }).generate(
      "Xin chào.",
      out,
    );
    expect(scope.isDone()).toBe(true);
  });

  it.each([400, 401, 404])(
    "does not retry HTTP %s or leave a cached file",
    async (status) => {
      const scope = nock("http://127.0.0.1:8000")
        .post("/v1/audio/speech")
        .reply(status, { error: { message: "bad request" } });
      await expect(
        new VieNeuClient({
          endpoint: "http://127.0.0.1:8000",
          apiKey: "secret-key",
        }).generate("Xin chào.", out),
      ).rejects.toThrow(`status ${status}`);
      expect(scope.isDone()).toBe(true);
      expect(existsSync(out)).toBe(false);
    },
  );

  it.each([429, 503])("retries transient HTTP %s", async (status) => {
    const scope = nock("http://127.0.0.1:8000")
      .post("/v1/audio/speech")
      .reply(status)
      .post("/v1/audio/speech")
      .reply(200, wav);
    await new VieNeuClient({ endpoint: "http://127.0.0.1:8000" }).generate(
      "Xin chào.",
      out,
    );
    expect(scope.isDone()).toBe(true);
  });

  it.each([Buffer.from('{"error":"oops"}'), wav.subarray(0, 44)])(
    "rejects invalid or empty audio without caching it",
    async (body) => {
      nock("http://127.0.0.1:8000").post("/v1/audio/speech").reply(200, body);
      await expect(
        new VieNeuClient({ endpoint: "http://127.0.0.1:8000" }).generate(
          "Xin chào.",
          out,
        ),
      ).rejects.toThrow(/invalid or empty WAV/);
      expect(existsSync(out)).toBe(false);
    },
  );

  it("rejects clone without a reference before making an HTTP request", async () => {
    await expect(
      new VieNeuClient({ endpoint: "http://127.0.0.1:8000" }).generate(
        "Xin chào.",
        out,
        { mode: "clone" },
      ),
    ).rejects.toThrow(/POST \/v1\/voices/);
    expect(existsSync(out)).toBe(false);
  });
});

it("creates the selected provider while preserving OmniVoice", () => {
  const cfg: Config = {
    ttsProvider: "omnivoice",
    omnivoiceEndpoint: "http://127.0.0.1:8123",
    vieneuEndpoint: "http://127.0.0.1:8000",
    ttsConcurrency: 1,
  };
  expect(createTtsClient(cfg)).toBeInstanceOf(OmniVoiceClient);
  expect(createTtsClient({ ...cfg, ttsProvider: "vieneu" })).toBeInstanceOf(
    VieNeuClient,
  );
});

it("sends OmniVoice clone audio, transcript and selected sampling options together", async () => {
  const reference = join(dir, "reference.wav");
  writeFileSync(reference, wav);
  let sent = "";
  const scope = nock("http://127.0.0.1:8123")
    .post("/v1/audio/speech/clone")
    .reply(200, (_uri, data) => {
      const raw = String(data);
      sent = /^[a-f0-9]+$/i.test(raw)
        ? Buffer.from(raw, "hex").toString("utf8")
        : raw;
      return wav;
    });
  await new OmniVoiceClient({ endpoint: "http://127.0.0.1:8123" }).generate(
    "Xin chào.",
    out,
    {
      mode: "clone",
      referenceAudioPath: reference,
      referenceText: "Xin chào.",
      speed: 1.2,
      numStep: 16,
    },
  );
  expect(scope.isDone()).toBe(true);
  expect(existsSync(out)).toBe(true);
  expect(sent).toContain('name="ref_audio"');
  expect(sent).toContain('name="ref_text"');
  expect(sent).toContain('name="speed"\r\n\r\n1.2');
  expect(sent).toContain('name="num_step"\r\n\r\n16');
});
