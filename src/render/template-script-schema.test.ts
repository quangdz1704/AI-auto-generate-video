import { describe, expect, it } from "vitest";
import { TemplateScriptSchema } from "./template-script-schema.js";

const baseScript = {
  version: "1.0",
  renderer: "hyperframes",
  metadata: {
    title: "Test",
    source: { url: "", domain: "local", image: null },
    channel: "AI Coding",
  },
  voice: { provider: "omnivoice", speed: 1 },
  scenes: [
    { id: "hook", type: "hook", voiceText: "Mo dau.", templateId: "frame-liquid-bg-hero" },
    { id: "body", type: "body", voiceText: "Noi dung.", templateId: "frame-vignelli" },
    { id: "outro", type: "outro", voiceText: "Ket thuc.", templateId: "frame-logo-outro" },
  ],
};

describe("TemplateScriptSchema voice options", () => {
  it("defaults existing scripts to design mode", () => {
    const parsed = TemplateScriptSchema.parse(baseScript);
    expect(parsed.voice.mode).toBe("design");
    expect(parsed.voice.speed).toBe(1);
  });

  it("accepts a voice-design configuration", () => {
    const parsed = TemplateScriptSchema.parse({
      ...baseScript,
      voice: {
        provider: "omnivoice",
        speed: 1,
        mode: "design",
        instructions: "female, young adult, moderate pitch",
        numStep: 16,
        positionTemperature: 0,
        classTemperature: 0,
      },
    });
    expect(parsed.voice.instructions).toContain("female");
  });

  it("requires a recording and transcript in clone mode", () => {
    expect(() => TemplateScriptSchema.parse({
      ...baseScript,
      voice: { provider: "omnivoice", speed: 1, mode: "clone" },
    })).toThrow(/referenceAudio/);
  });
});
