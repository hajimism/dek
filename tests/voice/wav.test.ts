import { describe, expect, test } from "bun:test";
import { concatWavs, encodeWav, silencePcm, wavDurationMs } from "../../src/voice/wav.ts";

function tone(durationMs: number): Buffer {
  return encodeWav({
    sampleRate: 24000,
    channels: 1,
    bitsPerSample: 16,
    pcm: silencePcm(durationMs, { sampleRate: 24000, channels: 1, bitsPerSample: 16 }),
  });
}

describe("wavDurationMs", () => {
  test("reads PCM length as milliseconds", () => {
    expect(wavDurationMs(tone(350))).toBe(350);
  });
});

describe("concatWavs", () => {
  test("keeps trailing pause and leading silence in the clock", () => {
    const out = concatWavs([tone(1000), tone(400)], [700, 700], 200);
    expect(wavDurationMs(out)).toBe(3000);
  });
});
