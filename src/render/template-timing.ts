import type { TemplateSceneType } from "./template-script-schema.js";

export const PAPER_STORY = "frame-paper-story";
/** Keep narration-driven captions alive for the full spoken scene. */
export function timedComposition(
  scene: Pick<TemplateSceneType, "templateId" | "inputs" | "voiceText">,
  narrationSeconds: number,
  visualSeconds: number,
) {
  if (scene.templateId !== PAPER_STORY) return { inputs: scene.inputs };
  return {
    inputs: {
      ...scene.inputs,
      narrationText: scene.voiceText,
      narrationSeconds,
    },
    durationSec: visualSeconds,
  };
}
export function estimateNarrationSeconds(text: string) {
  return Math.max(
    3,
    Math.min(180, text.trim().split(/\s+/).filter(Boolean).length / 3.2),
  );
}
