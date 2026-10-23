import { afterEach, beforeEach, expect, it, vi } from "vitest";
import nock from "nock";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runTemplatePipeline } from "./template-pipeline.js";
import { getDurationSec } from "../assets/audio-tools.js";
import { TemplateScriptSchema } from "./template-script-schema.js";

// Exercise real HTTP, cache selection and FFmpeg audio processing. Rendering
// is unrelated to the TTS integration and would download Chromium/HyperFrames.
vi.mock("./template-composer.js", () => ({ composeTemplate: vi.fn() }));
vi.mock("./video-tools.js", () => ({
  fitClipToDuration: vi.fn(),
  concatVideos: vi.fn(),
  muxAudioOntoVideo: vi.fn(),
}));

// 0.1 seconds of 48 kHz mono PCM; unknown-length header matches VieNeu's API.
const wav = Buffer.alloc(44 + 9600);
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

const makeScript = () => ({
  version: "1.0",
  renderer: "hyperframes",
  metadata: {
    title: "Bản thử TTS",
    channel: "Demo",
    source: { url: "", domain: "", image: null },
  },
  voice: { provider: "vieneu", voice: "Mai Anh", speed: 1 },
  scenes: ["hook", "body", "outro"].map((type) => ({
    id: type,
    type,
    templateId: "frame-bold-poster",
    voiceText: `Xin chào ${type}.`,
    sfx: { name: "none" },
  })),
});

let dir: string;
let scriptPath: string;
beforeEach(async () => {
  nock.disableNetConnect();
  vi.stubEnv("TTS_PROVIDER", undefined);
  vi.stubEnv("TTS_CONCURRENCY", "1");
  vi.stubEnv("VIENEU_ENDPOINT", "http://127.0.0.1:8000");
  vi.stubEnv("VIENEU_VOICE", undefined);
  vi.stubEnv("VIENEU_API_KEY", undefined);
  dir = await mkdtemp(join(tmpdir(), "tts-pipeline-"));
  scriptPath = join(dir, "script.json");
});
afterEach(async () => {
  nock.cleanAll();
  nock.enableNetConnect();
  vi.unstubAllEnvs();
  await rm(dir, { recursive: true, force: true });
});

it("uses VieNeu's WAV in FFmpeg, separates OmniVoice's cache and invalidates changed voices/text", async () => {
  const script = makeScript();
  await writeFile(scriptPath, JSON.stringify(script));
  await mkdir(join(dir, "voice"));
  const oldOmniAudio = join(dir, "voice", "scene-hook.wav");
  await writeFile(oldOmniAudio, wav);

  const first = nock("http://127.0.0.1:8000")
    .post(
      "/v1/audio/speech",
      (body) => body.voice === "Mai Anh" && body.response_format === "wav",
    )
    .times(3)
    .reply(200, wav);
  await runTemplatePipeline(scriptPath);
  expect(first.isDone()).toBe(true);
  expect(await readFile(oldOmniAudio)).toEqual(wav);
  expect(await readdir(join(dir, "voice", "vieneu"))).toHaveLength(3);
  expect(await getDurationSec(join(dir, "voice.mp3"))).toBeGreaterThan(0.8);
  expect(await readFile(join(dir, "script.txt"), "utf8")).toContain(
    "Xin chào hook.",
  );

  // No HTTP mocks remain: an unchanged script must reuse the generated audio.
  await runTemplatePipeline(scriptPath);

  vi.stubEnv("VIENEU_VOICE", "another-voice");
  const changedVoice = nock("http://127.0.0.1:8000")
    .post("/v1/audio/speech", (body) => body.voice === "another-voice")
    .times(3)
    .reply(200, wav);
  await runTemplatePipeline(scriptPath);
  expect(changedVoice.isDone()).toBe(true);

  script.scenes[0].voiceText = "Một câu mới.";
  await writeFile(scriptPath, JSON.stringify(script));
  const changedText = nock("http://127.0.0.1:8000")
    .post("/v1/audio/speech", (body) => body.input === "Một câu mới.")
    .reply(200, wav);
  await runTemplatePipeline(scriptPath);
  expect(changedText.isDone()).toBe(true);
  expect(await readdir(join(dir, "voice", "vieneu"))).toHaveLength(7);
}, 20000);

it("keeps OmniVoice's existing request options and voice cache layout", async () => {
  vi.stubEnv("TTS_PROVIDER", "omnivoice");
  vi.stubEnv("OMNIVOICE_ENDPOINT", "http://127.0.0.1:8123");
  const script = {
    ...makeScript(),
    voice: {
      provider: "omnivoice",
      instructions: "female",
      speed: 1,
      numStep: 16,
    },
  };
  await writeFile(scriptPath, JSON.stringify(script));
  const scope = nock("http://127.0.0.1:8123")
    .post(
      "/v1/audio/speech",
      (body) =>
        body.model === "omnivoice" &&
        body.instructions === "female" &&
        body.num_step === 16 &&
        body.speed === 1,
    )
    .times(3)
    .reply(200, wav);
  await runTemplatePipeline(scriptPath);
  expect(scope.isDone()).toBe(true);
  expect(await readdir(join(dir, "voice"))).toEqual([
    "scene-body.wav",
    "scene-hook.wav",
    "scene-outro.wav",
  ]);
}, 10000);

it("accepts the new provider and still defaults old scripts to OmniVoice", () => {
  expect(TemplateScriptSchema.parse(makeScript()).voice.provider).toBe(
    "vieneu",
  );
  const script = { ...makeScript(), voice: { speed: 1 } };
  expect(TemplateScriptSchema.parse(script).voice.provider).toBe("omnivoice");
});

it("enrolls a VieNeu clone once, reuses audio and invalidates cache when the reference changes", async () => {
  await writeFile(join(dir, "voice.wav"), wav);
  await writeFile(
    scriptPath,
    JSON.stringify({
      ...makeScript(),
      voice: {
        provider: "vieneu",
        mode: "clone",
        referenceAudio: "voice.wav",
        referenceText: "Xin chào.",
      },
    }),
  );
  const enroll = nock("http://127.0.0.1:8000")
    .post("/v1/voices")
    .reply(200, { id: "enrolled" });
  const speech = nock("http://127.0.0.1:8000")
    .post("/v1/audio/speech", (b) => /^studio-[a-f0-9]{20}$/.test(b.voice))
    .times(3)
    .reply(200, wav);
  await runTemplatePipeline(scriptPath);
  expect(enroll.isDone()).toBe(true);
  expect(speech.isDone()).toBe(true);
  await runTemplatePipeline(scriptPath);
  const changed = Buffer.from(wav);
  changed[44] = 1;
  await writeFile(join(dir, "voice.wav"), changed);
  const second = nock("http://127.0.0.1:8000")
    .post("/v1/voices")
    .reply(200, {});
  nock("http://127.0.0.1:8000")
    .post("/v1/audio/speech")
    .times(3)
    .reply(200, wav);
  await runTemplatePipeline(scriptPath);
  expect(second.isDone()).toBe(true);
  expect(await readdir(join(dir, "voice", "vieneu"))).toHaveLength(6);
}, 20000);
