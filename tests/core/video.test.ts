import { describe, expect, test } from "bun:test";
import { readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { playwrightResolved } from "../../src/core/playwright.ts";
import { DEFAULT_LEAD_MS, type Timeline } from "../../src/core/timeline.ts";
import { ffmpegResolved, muxVideo } from "../../src/video/mux.ts";
import {
  captureHoldFrames,
  defaultVideoRunner,
  frameStops,
  holdMs,
  planCapture,
} from "../../src/video/recorder.ts";
import { encodeWav, parseWav, silentWav, sliceWav } from "../../src/voice/wav.ts";
import { withTempDir } from "../helpers/fs.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const timeline: Timeline = {
  audio: "a.wav",
  durationMs: 2000,
  beats: [
    {
      position: { slideIndex: 0, beatIndex: 0 },
      start: 0,
      end: 1000,
      sentences: [{ text: "a", kana: "ア", start: 0, end: 1000 }],
    },
    {
      position: { slideIndex: 1, beatIndex: 0 },
      start: 1700,
      end: 2000,
      sentences: [{ text: "b", kana: "イ", start: 1700, end: 2000 }],
    },
  ],
};

describe("planCapture", () => {
  test("hold is one frame per beat when there is no animation", () => {
    const plan = planCapture(timeline, 30);
    expect(plan.gos).toEqual([
      { at: 0, position: { slideIndex: 0, beatIndex: 0 } },
      { at: 1700 - DEFAULT_LEAD_MS, position: { slideIndex: 1, beatIndex: 0 } },
    ]);
    expect(plan.frames.every((frame) => frame.kind === "hold")).toBe(true);
    expect(plan.frames).toHaveLength(2);
  });

  test("leads each go by the shared lead-in, like rehearse", () => {
    const plan = planCapture(timeline, 30);
    expect(plan.gos.map((go) => go.at)).toEqual([0, 1700 - DEFAULT_LEAD_MS]);
  });

  test("spans run from go to go and cover the whole audio", () => {
    const plan = planCapture(timeline, 30);
    expect(plan.frames.map((frame) => frame.durationMs)).toEqual([
      1700 - DEFAULT_LEAD_MS,
      2000 - (1700 - DEFAULT_LEAD_MS),
    ]);
  });

  test("the first span starts at zero even when the first beat is silent lead", () => {
    const late: Timeline = {
      ...timeline,
      beats: timeline.beats.map((beat, index) => (index === 0 ? { ...beat, start: 500 } : beat)),
    };
    const total = planCapture(late, 30).frames.reduce((sum, frame) => sum + frame.durationMs, 0);
    expect(total).toBe(2000);
  });

  test("a lead longer than the beat before it keeps the gos in order", () => {
    const early: Timeline = {
      ...timeline,
      beats: [
        ...timeline.beats.slice(0, 1),
        { position: { slideIndex: 1, beatIndex: 0 }, start: 1000, end: 1200, sentences: [] },
        {
          position: { slideIndex: 2, beatIndex: 0 },
          start: 1700,
          end: 2000,
          sentences: [],
          lead: 1500,
        },
      ],
    };
    const at = planCapture(early, 30).gos.map((go) => go.at);
    expect(at).toEqual([0, 1000 - DEFAULT_LEAD_MS, 1000 - DEFAULT_LEAD_MS]);
  });
});

describe("frameStops", () => {
  test("splits the animation into fps-sized stops ending at the full duration", () => {
    expect(frameStops(300, 10)).toEqual([100, 200, 300]);
  });
  test("never returns fewer than one stop for a non-zero animation", () => {
    expect(frameStops(20, 10)).toEqual([20]);
  });
  test("returns no stops for a zero-length animation", () => {
    expect(frameStops(0, 30)).toEqual([]);
  });
  test("rounds to whole frames and spreads the remainder evenly", () => {
    const stops = frameStops(333, 10);
    expect(stops).toHaveLength(3);
    expect(stops.at(-1)).toBe(333);
  });
});

describe("holdMs", () => {
  test("is the beat minus the animation, never below one millisecond", () => {
    expect(holdMs(2000, 300)).toBe(1700);
    expect(holdMs(200, 300)).toBe(1);
  });
});

describe("frame durations", () => {
  test("animation stops plus hold add up to the beat", () => {
    const stops = frameStops(300, 10);
    const durations = stops.map((t, i) => t - (stops[i - 1] ?? 0));
    expect(durations.reduce((a, b) => a + b, 0) + holdMs(2000, 300)).toBe(2000);
  });
});

describe("captureHoldFrames", () => {
  test("writes one hold PNG per beat", async () => {
    await withTempDir(async (dir) => {
      const captured = captureHoldFrames({
        html: "<html></html>",
        timeline,
        fps: 30,
        viewport: { width: 1280, height: 720 },
        outDir: dir,
      });
      expect(captured.frames).toHaveLength(2);
      expect(captured.frames[0]?.durationMs).toBe(1700 - DEFAULT_LEAD_MS);
      expect(captured.frames.reduce((sum, frame) => sum + frame.durationMs, 0)).toBe(
        timeline.durationMs,
      );
    });
  });
});

describe("fake video worker", () => {
  test("records go positions and one hold screenshot per beat", async () => {
    await withTempDir(async (dir) => {
      const fake = join(import.meta.dir, "../helpers/fake-video.ts");
      const proc = Bun.spawn(["bun", "--no-install", fake], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
      });
      proc.stdin.write(
        JSON.stringify({
          html: "<html></html>",
          timeline,
          fps: 10,
          viewport: { width: 1, height: 1 },
          outDir: dir,
        }),
      );
      await proc.stdin.end();
      const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      expect(code).toBe(0);
      const json = JSON.parse(out) as { gos: unknown[]; frames: unknown[] };
      expect(json.gos).toHaveLength(2);
      expect(json.frames).toHaveLength(2);
    });
  });
});

describe("sliceWav", () => {
  test("keeps only the requested PCM window", () => {
    const pcm = Buffer.alloc(20);
    for (let i = 0; i < 10; i++) {
      pcm.writeInt16LE(i + 1, i * 2);
    }
    const wav = encodeWav({ sampleRate: 1000, channels: 1, bitsPerSample: 16, pcm });
    const sliced = parseWav(sliceWav(wav, 3, 4));
    expect(sliced.pcm.length).toBe(8);
    expect(sliced.pcm.readInt16LE(0)).toBe(4);
    expect(sliced.pcm.readInt16LE(2)).toBe(5);
    expect(sliced.pcm.readInt16LE(4)).toBe(6);
    expect(sliced.pcm.readInt16LE(6)).toBe(7);
  });
});

describe("defaultVideoRunner", () => {
  test.serial("throws when Playwright is missing and DEK_VIDEO is unset", async () => {
    await withTempDir(async (dir) => {
      const previous = process.env.DEK_VIDEO;
      delete process.env.DEK_VIDEO;
      try {
        if (playwrightResolved()) {
          return;
        }
        await expect(
          defaultVideoRunner({
            html: "<html></html>",
            timeline,
            fps: 30,
            viewport: { width: 1, height: 1 },
            outDir: dir,
          }),
        ).rejects.toMatchObject({
          name: "DekError",
          message: "video capture failed",
        });
      } finally {
        if (previous === undefined) {
          delete process.env.DEK_VIDEO;
        } else {
          process.env.DEK_VIDEO = previous;
        }
      }
    });
  });

  test.serial("returns frames when the worker is slower than timeoutMs", async () => {
    await withTempDir(async (dir) => {
      const previous = process.env.DEK_VIDEO;
      process.env.DEK_VIDEO = join(import.meta.dir, "../helpers/fake-video-slow.ts");
      try {
        const captured = await defaultVideoRunner(
          {
            html: "<html></html>",
            timeline,
            fps: 30,
            viewport: { width: 1, height: 1 },
            outDir: dir,
          },
          { timeoutMs: 30 },
        );
        expect(captured.frames.length).toBeGreaterThan(0);
      } finally {
        if (previous === undefined) {
          delete process.env.DEK_VIDEO;
        } else {
          process.env.DEK_VIDEO = previous;
        }
      }
    });
  });

  test.serial("throws when the worker exits non-zero", async () => {
    await withTempDir(async (dir) => {
      const previous = process.env.DEK_VIDEO;
      process.env.DEK_VIDEO = join(import.meta.dir, "../helpers/fake-video-fail.ts");
      try {
        await expect(
          defaultVideoRunner({
            html: "<html></html>",
            timeline,
            fps: 30,
            viewport: { width: 1, height: 1 },
            outDir: dir,
          }),
        ).rejects.toMatchObject({
          name: "DekError",
          message: "video capture failed",
        });
      } finally {
        if (previous === undefined) {
          delete process.env.DEK_VIDEO;
        } else {
          process.env.DEK_VIDEO = previous;
        }
      }
    });
  });
});

describe("muxVideo", () => {
  test.serial("muxes two PNGs and a short wav when ffmpeg is on PATH", async () => {
    if (!ffmpegResolved()) {
      return;
    }
    await withTempDir(async (dir) => {
      const a = join(dir, "a.png");
      const b = join(dir, "b.png");
      writeFileSync(a, PNG);
      writeFileSync(b, PNG);
      const wav = join(dir, "audio.wav");
      writeFileSync(wav, silentWav(200));
      const out = join(dir, "out.mp4");
      const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("dek-mux-")));
      await muxVideo({
        frames: [
          { path: a, durationMs: 100 },
          { path: b, durationMs: 100 },
        ],
        audioPath: wav,
        outPath: out,
      });
      expect(await Bun.file(out).exists()).toBe(true);
      expect((await Bun.file(out).arrayBuffer()).byteLength).toBeGreaterThan(32);
      const leftover = readdirSync(tmpdir()).filter(
        (name) => name.startsWith("dek-mux-") && !before.has(name),
      );
      expect(leftover).toEqual([]);
    });
  });

  test.serial("resolves when ffmpeg writes a megabyte of stderr", async () => {
    await withTempDir(async (dir) => {
      const a = join(dir, "a.png");
      writeFileSync(a, PNG);
      const wav = join(dir, "audio.wav");
      writeFileSync(wav, silentWav(200));
      const out = join(dir, "out.mp4");
      const previous = process.env.DEK_FFMPEG;
      process.env.DEK_FFMPEG = join(import.meta.dir, "../helpers/fake-noisy.ts");
      try {
        const started = Date.now();
        await Promise.race([
          muxVideo({
            frames: [{ path: a, durationMs: 100 }],
            audioPath: wav,
            outPath: out,
          }),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error("hung")), 2000);
          }),
        ]);
        expect(Date.now() - started).toBeLessThan(2000);
        expect(await Bun.file(out).exists()).toBe(true);
      } finally {
        if (previous === undefined) {
          delete process.env.DEK_FFMPEG;
        } else {
          process.env.DEK_FFMPEG = previous;
        }
      }
    });
  });

  test.serial("removes the temp dir when ffmpeg fails", async () => {
    if (!ffmpegResolved()) {
      return;
    }
    await withTempDir(async (dir) => {
      const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("dek-mux-")));
      const wav = join(dir, "audio.wav");
      writeFileSync(wav, silentWav(200));
      await expect(
        muxVideo({
          frames: [{ path: join(dir, "missing.png"), durationMs: 100 }],
          audioPath: wav,
          outPath: join(dir, "out.mp4"),
        }),
      ).rejects.toMatchObject({ name: "DekError" });
      const leftover = readdirSync(tmpdir()).filter(
        (name) => name.startsWith("dek-mux-") && !before.has(name),
      );
      expect(leftover).toEqual([]);
    });
  });
});
