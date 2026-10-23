import { timedComposition } from "./template-timing.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, resolve } from "node:path";
import pLimit from "p-limit";
import {
  TemplateScriptSchema,
  type TemplateScript,
} from "./template-script-schema.js";
import { loadConfig, type Config } from "../config.js";
import { createTtsClient } from "../tts/tts-client.js";
import {
  getDurationSec,
  concatWithSilence,
  mixSfxOntoVoice,
  mixBackgroundMusic,
  type SfxMixSpec,
} from "../assets/audio-tools.js";
import {
  indexSfxLibrary,
  pickSfxForScene,
  defaultPlayback,
} from "../assets/sfx-selector.js";
import { composeTemplate } from "./template-composer.js";
import {
  fitClipToDuration,
  concatVideos,
  muxAudioOntoVideo,
} from "./video-tools.js";
import { log } from "../utils/logger.js";

const TOTAL_STEPS = 8;
const SCENE_GAP_SEC = 0.3;
const OUTRO_HOLD_SEC = 3;
const RENDER_FPS = 30;

/** Maps a scene role to a key the SFX selector understands (tier-3 defaults). */
const TYPE_TO_SFX: Record<string, string> = {
  hook: "hook",
  body: "callout",
  outro: "outro",
};

export interface PipelineOptions {
  config?: Config;
  onProgress?: (event: {
    progress: number;
    stage: string;
    message: string;
  }) => void;
  assetsDir?: string;
  quality?: "draft" | "standard" | "high";
  backgroundMusic?: { path: string; volume: number };
}

export async function runTemplatePipeline(
  scriptPath: string,
  options: PipelineOptions = {},
): Promise<void> {
  const progress = (value: number, stage: string, message: string) =>
    options.onProgress?.({ progress: value, stage, message });
  progress(2, "validate", "Kiểm tra kịch bản");
  const outputDir = dirname(scriptPath);
  log.info(`Output directory: ${outputDir}`);

  // STEP 1 — load + validate
  log.step(1, TOTAL_STEPS, "Load + validate template script");
  const raw = JSON.parse(await readFile(scriptPath, "utf8"));
  const script: TemplateScript = TemplateScriptSchema.parse(raw);
  const cfg = options.config ?? loadConfig(script.voice.provider);
  log.info(`TTS: ${cfg.ttsProvider}`);
  if (cfg.ttsProvider === "vieneu") {
    if (
      script.voice.speed !== 1 ||
      script.voice.instructions ||
      script.voice.numStep !== undefined ||
      script.voice.positionTemperature !== undefined ||
      script.voice.classTemperature !== undefined
    ) {
      log.warn(
        "VieNeu uses its preset voice; OmniVoice design/sampling settings and voice.speed are not applied.",
      );
    }
  }

  // STEP 2 — script.txt for CapCut
  log.step(2, TOTAL_STEPS, "Write script.txt");
  await writeFile(
    join(outputDir, "script.txt"),
    script.scenes.map((s) => s.voiceText).join("\n\n"),
  );
  progress(5, "script", "Đã chuẩn bị lời đọc");

  // STEP 3 — TTS per scene (idempotent)
  log.step(3, TOTAL_STEPS, "TTS each scene");
  const ttsClient = createTtsClient(cfg);
  const limit = pLimit(cfg.ttsConcurrency);
  let voiced = 0;
  progress(8, "tts", `Tạo giọng đọc cho ${script.scenes.length} cảnh`);
  const voiceDir =
    cfg.ttsProvider === "vieneu"
      ? join(outputDir, "voice", "vieneu")
      : join(outputDir, "voice");
  await mkdir(voiceDir, { recursive: true });
  const sceneAudio = await Promise.all(
    script.scenes.map((scene) =>
      limit(async () => {
        // Separate VieNeu's cache from OmniVoice. Changing text, voice or
        // server must generate new audio instead of reusing another voice.
        const cacheKey =
          cfg.ttsProvider === "vieneu"
            ? `-${createHash("sha256")
                .update(
                  JSON.stringify([
                    cfg.vieneuEndpoint,
                    cfg.vieneuVoice ?? script.voice.voice ?? null,
                    scene.voiceText,
                    script.voice.mode,
                    script.voice.referenceAudio
                      ? createHash("sha256")
                          .update(
                            await readFile(
                              isAbsolute(script.voice.referenceAudio)
                                ? script.voice.referenceAudio
                                : resolve(
                                    outputDir,
                                    script.voice.referenceAudio,
                                  ),
                            ),
                          )
                          .digest("hex")
                      : null,
                  ]),
                )
                .digest("hex")
                .slice(0, 16)}`
            : "";
        const out = join(voiceDir, `scene-${scene.id}${cacheKey}.wav`);
        if (existsSync(out)) {
          const dur = await getDurationSec(out);
          log.info(`  scene ${scene.id}: REUSE wav (${dur.toFixed(2)}s)`);
          progress(
            8 + (35 * ++voiced) / script.scenes.length,
            "tts",
            `Giọng đọc ${voiced}/${script.scenes.length}`,
          );
          return { id: scene.id, path: out, durationSec: dur };
        }
        log.info(
          `  TTS scene ${scene.id} (${scene.voiceText.length} chars)...`,
        );
        await ttsClient.generate(scene.voiceText, out, {
          mode: script.voice.mode,
          instructions: script.voice.instructions,
          voice: script.voice.voice,
          speed: script.voice.speed,
          numStep: script.voice.numStep,
          positionTemperature: script.voice.positionTemperature,
          classTemperature: script.voice.classTemperature,
          referenceAudioPath: script.voice.referenceAudio
            ? isAbsolute(script.voice.referenceAudio)
              ? script.voice.referenceAudio
              : resolve(outputDir, script.voice.referenceAudio)
            : undefined,
          referenceText: script.voice.referenceText,
        });
        const dur = await getDurationSec(out);
        progress(
          8 + (35 * ++voiced) / script.scenes.length,
          "tts",
          `Giọng đọc ${voiced}/${script.scenes.length}`,
        );
        log.info(`  scene ${scene.id}: ${dur.toFixed(2)}s`);
        return { id: scene.id, path: out, durationSec: dur };
      }),
    ),
  );

  // STEP 4 — concat voice + compute scene timings
  log.step(4, TOTAL_STEPS, "Concat voice + compute timings");
  progress(45, "audio", "Ghép lời đọc và căn thời gian");
  const voiceRawMp3 = join(outputDir, "voice-raw.mp3");
  const voiceMp3 = join(outputDir, "voice.mp3");
  await concatWithSilence(
    sceneAudio.map((a) => a.path),
    SCENE_GAP_SEC,
    voiceRawMp3,
  );

  let cursor = 0;
  const sceneStarts: Record<string, number> = {};
  for (const a of sceneAudio) {
    sceneStarts[a.id] = cursor;
    cursor += a.durationSec + SCENE_GAP_SEC;
  }

  // STEP 5 — SFX selection + mix
  log.step(5, TOTAL_STEPS, "Pick + mix SFX");
  const SFX_DIR =
    options.assetsDir ?? join(outputDir, "..", "..", "assets", "sfx");
  const sfxIndex = existsSync(SFX_DIR) ? indexSfxLibrary(SFX_DIR) : {};
  const sfxList: SfxMixSpec[] = [];
  for (const scene of script.scenes) {
    const startSec = sceneStarts[scene.id];
    if (scene.sfx) {
      if (scene.sfx.name === "none") continue;
      const p = join(SFX_DIR, `${scene.sfx.name}.mp3`);
      if (existsSync(p))
        sfxList.push({
          path: p,
          startSec: startSec + scene.sfx.startOffsetSec,
          volume: scene.sfx.volume,
        });
      continue;
    }
    if (Object.keys(sfxIndex).length === 0) continue;
    const picked = pickSfxForScene({
      voiceText: scene.voiceText,
      templateName: TYPE_TO_SFX[scene.type] ?? "callout",
      sceneId: scene.id,
      index: sfxIndex,
    });
    if (!picked) continue;
    const pb = defaultPlayback(picked);
    sfxList.push({
      path: join(SFX_DIR, picked.relPath),
      startSec: startSec + pb.offsetSec,
      volume: pb.volume,
    });
  }
  progress(50, "audio", "Trộn hiệu ứng âm thanh");
  const sfxOutput = options.backgroundMusic
    ? join(outputDir, "voice-sfx.mp3")
    : voiceMp3;
  await mixSfxOntoVoice(voiceRawMp3, sfxList, sfxOutput);
  if (options.backgroundMusic) {
    await mixBackgroundMusic(
      sfxOutput,
      options.backgroundMusic.path,
      options.backgroundMusic.volume,
      voiceMp3,
    );
  }
  const totalAudioSec = await getDurationSec(voiceMp3);
  log.info(`  voice.mp3: ${totalAudioSec.toFixed(2)}s, ${sfxList.length} SFX`);

  // STEP 6 — render each scene's template clip, fit to its narration length
  log.step(6, TOTAL_STEPS, "Render template clips + fit to narration");
  progress(55, "render", "Bắt đầu dựng hình");
  const clipsDir = join(outputDir, "clips");
  await mkdir(clipsDir, { recursive: true });
  const lastIdx = script.scenes.length - 1;
  const fittedClips: string[] = [];
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const dur = sceneAudio.find((a) => a.id === scene.id)!.durationSec;
    const visualDur = dur + (i < lastIdx ? SCENE_GAP_SEC : OUTRO_HOLD_SEC);

    const rawClip = join(clipsDir, `scene-${scene.id}.mp4`);
    const fitClip = join(clipsDir, `scene-${scene.id}-fit.mp4`);
    // IDEMPOTENT: reuse an already-rendered clip. Delete it to force a
    // re-render after editing the scene's inputs or template.
    if (existsSync(rawClip)) {
      log.info(`  scene ${scene.id}: REUSE clip — delete to force re-render`);
    } else {
      await composeTemplate({
        templateId: scene.templateId,
        ...timedComposition(scene, dur, visualDur),
        aspect: script.aspect,
        outputPath: rawClip,
        fps: RENDER_FPS,
        quality: options.quality,
      });
    }
    await fitClipToDuration(rawClip, visualDur, fitClip, RENDER_FPS);
    log.info(
      `  scene ${scene.id}: ${scene.templateId} → ${visualDur.toFixed(2)}s`,
    );
    fittedClips.push(fitClip);
    progress(
      55 + (35 * (i + 1)) / script.scenes.length,
      "render",
      `Đã dựng ${i + 1}/${script.scenes.length} cảnh`,
    );
  }

  // STEP 7 — concat clips + mux voice
  log.step(7, TOTAL_STEPS, "Concat clips + mux audio");
  progress(93, "export", "Ghép hình và xuất video");
  const silentVideo = join(outputDir, "video-silent.mp4");
  const videoPath = join(outputDir, "video.mp4");
  await concatVideos(fittedClips, silentVideo);
  await muxAudioOntoVideo(silentVideo, voiceMp3, videoPath);
  progress(100, "complete", "Video đã sẵn sàng");

  // STEP 8 — done
  log.step(8, TOTAL_STEPS, "Done");
  console.log("\n=== Result ===");
  console.log(`Video:  ${videoPath}`);
  console.log(`Audio:  ${voiceMp3}  (cho CapCut)`);
  console.log(
    `Script: ${join(outputDir, "script.txt")}  (cho CapCut auto-caption)`,
  );
  console.log(`Tong thoi luong: ${totalAudioSec.toFixed(2)}s`);
}
