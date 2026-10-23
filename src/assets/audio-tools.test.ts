import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { getDurationSec, concatWithSilence, mixBackgroundMusic } from "./audio-tools.js";

let tmp: string;
beforeEach(() => { tmp = mkdtempSync(join(tmpdir(), "aud-")); });
afterEach(() => { rmSync(tmp, { recursive: true, force: true }); });

describe("getDurationSec", () => {
  it("returns ~2s for sample-audio-1.mp3", async () => {
    const d = await getDurationSec("tests/fixtures/sample-audio-1.mp3");
    expect(d).toBeGreaterThan(1.9);
    expect(d).toBeLessThan(2.2);
  });
});

describe("concatWithSilence", () => {
  it("concatenates two mp3s with 0.3s gap", async () => {
    const out = join(tmp, "voice.mp3");
    await concatWithSilence(
      ["tests/fixtures/sample-audio-1.mp3", "tests/fixtures/sample-audio-2.mp3"],
      0.3,
      out,
    );
    expect(existsSync(out)).toBe(true);
    const d = await getDurationSec(out);
    // 2s + 0.3s + 3s = 5.3s, allow ±0.3s
    expect(d).toBeGreaterThan(5.0);
    expect(d).toBeLessThan(5.6);
  });
});

describe("mixBackgroundMusic", () => {
  it("keeps narration duration when the music is longer", async () => {
    const out = join(tmp, "music-mix.mp3");
    await mixBackgroundMusic("tests/fixtures/sample-audio-1.mp3", "tests/fixtures/sample-audio-2.mp3", 0.12, out);
    const duration = await getDurationSec(out);
    expect(duration).toBeGreaterThan(1.9);
    expect(duration).toBeLessThan(2.3);
  });

  it("rejects invalid volume before running FFmpeg", async () => {
    await expect(mixBackgroundMusic("voice.mp3", "music.mp3", NaN, "out.mp3")).rejects.toThrow(/volume/);
  });
});
