import { describe, expect, test } from "bun:test";
import { readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { playwrightResolved } from "../../src/core/playwright.ts";
import type { Timeline } from "../../src/core/timeline.ts";
import { ffmpegResolved, muxVideo } from "../../src/video/mux.ts";
import { captureHoldFrames, defaultVideoRunner, planCapture } from "../../src/video/recorder.ts";
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
      { at: 1700, position: { slideIndex: 1, beatIndex: 0 } },
    ]);
    expect(plan.frames.every((frame) => frame.kind === "hold")).toBe(true);
    expect(plan.frames).toHaveLength(2);
  });

  test("animation interval uses fps; hold stays one frame", () => {
    const plan = planCapture(timeline, 10, () => 200);
    expect(plan.gos).toHaveLength(2);
    const first = plan.frames.filter((frame) => frame.afterGo === 0);
    expect(first.filter((frame) => frame.kind === "animation")).toHaveLength(2);
    expect(first.filter((frame) => frame.kind === "hold")).toHaveLength(1);
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
      expect(captured.frames[0]?.durationMs).toBe(1700);
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
