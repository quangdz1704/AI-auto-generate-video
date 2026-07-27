---
name: create-template-video
description: Create a finished Vietnamese vertical 9:16 news or explainer video from an article URL or local .txt file using this repository's HyperFrames templates, local OmniVoice TTS, FFmpeg, and optional SFX. Use when the user asks to create a template video, short news video, TikTok/Reel/YouTube Short from a URL or text, or to turn an article into a narrated Vietnamese video.
---

# Create Template Video

Turn one URL or `.txt` source into `video.mp4`, `voice.mp3`, `script.txt`, and
the reusable `script.json`. This skill operates this repository; it does not
use a generative video model.

## Locate and prepare the project

1. Work from this repository root, which contains `src/render/template-pipeline.ts`
   and `templates/CATALOG.md`.
2. Check the TTS server with `curl http://127.0.0.1:8123/health`. If it is not
   ready, start the local server described in `docs/omnivoice.md`; do not
   silently switch to a cloud TTS provider.
3. Ensure Node dependencies exist (`npm install` if `node_modules/` is absent).
   Check that `ffmpeg`, `ffprobe`, and Chrome/Chromium are available.
4. Read `templates/CATALOG.md` before choosing any `templateId`. Read
   `references/voice-json.md` when selecting voice options.

## Create the script

1. For a URL, extract its title, main content, source domain, and OG image if
   available. If retrieval fails, ask for a `.txt` file rather than inventing
   article facts. For a text file, use its first line as the title and the rest
   as the source content.
2. Create `output/<ascii-slug>-<YYYYMMDD-HHmm>/`. Write `script.json` there.
   Use the schema and example in `references/voice-json.md`.
3. Produce 8–12 scenes for a normal 90–120 second news short, unless the user
   requests a different length. Use 3–6 scenes only for a deliberately short
   video. The first scene is `hook`, the last is `outro`.
4. Use `frame-liquid-bg-hero` for the hook and `frame-logo-outro` for the
   outro by default. Choose diverse body templates based on the idea: a stat,
   list, comparison, strong statement, or breaking-news callout.
5. Keep every `inputs` value concise and within the catalog limits. Preserve
   readable numeric formatting in visual inputs (for example `82.7%`).
6. Write `voiceText` for speech, not display: spell numbers out in Vietnamese,
   omit URLs and emoji, and use complete sentences. Keep each body scene to
   one idea so the visuals change frequently.
7. Default to a stable `design` voice configuration. Use `clone` only when the
   user supplies a recording they own or are explicitly authorized to clone,
   plus its exact transcript.

## Render and hand off

1. Run the pipeline in the foreground:

   ```bash
   npm run pipeline -- output/<slug>-<timestamp>/script.json
   ```

2. Report clickable paths to `video.mp4`, `voice.mp3`, `script.txt`, and
   `script.json`, plus the total duration printed by the pipeline.
3. Explain that SFX is optional: if `assets/sfx/` is absent, rendering still
   succeeds without sound effects. Do not block the video on SFX downloads.
4. For a revision, delete only `voice/scene-<id>.wav` to regenerate narration,
   or only `clips/scene-<id>.mp4` to re-render that visual. Preserve unrelated
   output files.

## Failure handling

- A 404 on `/tts` means an obsolete adapter is in use. This repository uses
  `POST /v1/audio/speech` for design mode and
  `POST /v1/audio/speech/clone` for clone mode.
- If a scene is invalid, fix `script.json` against the template catalog before
  rerunning. The pipeline schema validates scene structure but template input
  slots are intentionally checked by the authoring workflow.
- If OmniVoice is unavailable, report the server issue and leave the authored
  `script.json` in place. Do not replace the narration with a different voice
  provider without user approval.
