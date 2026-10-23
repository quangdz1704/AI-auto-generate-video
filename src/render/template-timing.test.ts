import { expect, it } from "vitest";
import { timedComposition } from "./template-timing.js";
it("keeps paper captions tied to actual narration while rendering past the old poster duration", () => {
  const scene = {
    templateId: "frame-paper-story",
    voiceText: "Một câu chuyện đủ dài để đi qua nhiều khung hình.",
    inputs: {
      headline: "Tiêu đề",
      caption: "",
      narrationSeconds: 999,
      narrationText: "stale",
    },
  };
  const result = timedComposition(scene, 12.4, 13);
  expect(result.durationSec).toBe(13);
  expect(result.inputs.narrationSeconds).toBe(12.4);
  expect(result.inputs.narrationText).toBe(scene.voiceText);
  expect(scene.inputs.narrationSeconds).toBe(999);
});
it("preserves existing fixed-duration templates", () => {
  const inputs = { headline: "Hello" };
  expect(
    timedComposition(
      { templateId: "frame-photo-story", voiceText: "Hello", inputs },
      12,
      13,
    ),
  ).toEqual({ inputs });
});
