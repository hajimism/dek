import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { resolveTimelineAudio, voiceCacheFile } from "../../src/core/voice.ts";
import { bakeVideo, sliceTimelineAudio } from "../../src/video/bake.ts";
import { ffmpegResolved } from "../../src/video/mux.ts";
import { captureHoldFrames } from "../../src/video/recorder.ts";
import { encodeWav, parseWav, silentWav } from "../../src/voice/wav.ts";
import { withTempDir } from "../helpers/fs.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

describe("sliceTimelineAudio", () => {
  test("writes a wav covering the slide range, not the deck start", async () => {
    await withTempDir(async (dir) => {
      const pcm = Buffer.alloc(6000);
      pcm.fill(1, 0, 3400);
      pcm.fill(7, 3400);
      const source = join(dir, "master.wav");
      writeFileSync(source, encodeWav({ sampleRate: 1000, channels: 1, bitsPerSample: 16, pcm }));
      const slicedPath = join(dir, "slide.wav");
      const sliced = sliceTimelineAudio(
        {
          audio: source,
          durationMs: 3000,
          beats: [
            {
              position: { slideIndex: 0, beatIndex: 0 },
              start: 0,
              end: 1000,
              sentences: [],
            },
            {
              position: { slideIndex: 1, beatIndex: 0 },
              start: 1700,
              end: 2500,
              sentences: [],
            },
          ],
        },
        1,
        slicedPath,
      );
      expect(sliced.audio).toBe(slicedPath);
      expect(sliced.durationMs).toBe(1300);
      const parsed = parseWav(Buffer.from(await Bun.file(slicedPath).arrayBuffer()));
      expect(parsed.pcm.length).toBe(2600);
      expect(parsed.pcm[0]).toBe(7);
      expect(parsed.pcm[parsed.pcm.length - 1]).toBe(7);
    });
  });

  test("resolves relative audio next to a timeline path", async () => {
    await withTempDir(async (dir) => {
      const pcm = Buffer.alloc(6000);
      pcm.fill(1, 0, 3400);
      pcm.fill(7, 3400);
      writeFileSync(
        join(dir, "audio.wav"),
        encodeWav({ sampleRate: 1000, channels: 1, bitsPerSample: 16, pcm }),
      );
      const timelinePath = join(dir, "timeline.json");
      const relative = {
        audio: "audio.wav",
        durationMs: 3000,
        beats: [
          {
            position: { slideIndex: 0, beatIndex: 0 },
            start: 0,
            end: 1000,
            sentences: [],
          },
          {
            position: { slideIndex: 1, beatIndex: 0 },
            start: 1700,
            end: 2500,
            sentences: [],
          },
        ],
      };
      const slicedPath = join(dir, "slide.wav");
      const sliced = sliceTimelineAudio(
        { ...relative, audio: resolveTimelineAudio(relative, timelinePath) },
        1,
        slicedPath,
      );
      expect(sliced.audio).toBe(slicedPath);
      const parsed = parseWav(Buffer.from(await Bun.file(slicedPath).arrayBuffer()));
      expect(parsed.pcm[0]).toBe(7);
    });
  });
});

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

describe("bakeVideo", () => {
  test("bakes a parsed deck without re-reading script.md", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        mkdirSync(join(deckDir, "voice"), { recursive: true });
        await writeFile(
          join(deckDir, "voice", "voice.toml"),
          `engine = "voicevox"\nspeaker = "ずんだもん/ノーマル"\nspeed = 1\n`,
        );
        const cacheDir = join(deckDir, ".cache", "voice");
        mkdirSync(cacheDir, { recursive: true });
        await writeFile(voiceCacheFile(deckDir, "audio.wav"), silentWav(200));
        await writeFile(
          voiceCacheFile(deckDir, "timeline.json"),
          `${JSON.stringify({
            audio: "audio.wav",
            durationMs: 200,
            beats: [
              {
                position: { slideIndex: 0, beatIndex: 0 },
                start: 0,
                end: 200,
                sentences: [{ text: "hello", kana: "ハロー", start: 0, end: 200 }],
              },
            ],
          })}\n`,
        );
        const resolved = resolveDeck(deckDir);
        await writeFile(join(deckDir, "script.md"), "this is not a deck\n");
        const runner = async (request: Parameters<typeof captureHoldFrames>[0]) =>
          captureHoldFrames(request);
        await expect(bakeVideo(resolved.deck.dir, { runner })).rejects.toThrow(DekError);
        try {
          const result = await bakeVideo(resolved, { runner });
          expect(result.out).toBe(join(root, "decks", "demo", "dist", "demo.mp4"));
        } catch (error) {
          expect(error).toBeInstanceOf(DekError);
          expect((error as DekError).message).toBe("ffmpeg not found");
        }
      },
    );
  });

  test("writes one slide under .cache/video/", async () => {
    if (!ffmpegResolved()) {
      return;
    }
    await withPreparedVoiceDeck(async (root, resolved) => {
      const runner = async (request: Parameters<typeof captureHoldFrames>[0]) =>
        captureHoldFrames(request);
      const result = await bakeVideo(resolved, { runner, slug: "intro" });
      expect(result.out).toBe(join(root, "decks", "demo", ".cache", "video", "intro.mp4"));
      expect(await Bun.file(result.out).exists()).toBe(true);
    });
  });

  test("writes project dist/<deck>.mp4 with rootDist", async () => {
    if (!ffmpegResolved()) {
      return;
    }
    await withPreparedVoiceDeck(async (root, resolved) => {
      const runner = async (request: Parameters<typeof captureHoldFrames>[0]) =>
        captureHoldFrames(request);
      const result = await bakeVideo(resolved, { runner, rootDist: true });
      expect(result.out).toBe(join(root, "dist", "demo.mp4"));
      expect(result.vtt).toBe(join(root, "dist", "demo.vtt"));
      expect(await Bun.file(result.out).exists()).toBe(true);
    });
  });
});

async function withPreparedVoiceDeck(
  fn: (root: string, resolved: ReturnType<typeof resolveDeck>) => Promise<void>,
): Promise<void> {
  await withTempProject(
    { decks: [{ name: "demo", slides: { intro: introHtml } }] },
    async (root) => {
      const deckDir = join(root, "decks", "demo");
      mkdirSync(join(deckDir, "voice"), { recursive: true });
      await writeFile(
        join(deckDir, "voice", "voice.toml"),
        `engine = "voicevox"\nspeaker = "ずんだもん/ノーマル"\nspeed = 1\n`,
      );
      mkdirSync(join(deckDir, ".cache", "voice"), { recursive: true });
      await writeFile(voiceCacheFile(deckDir, "audio.wav"), silentWav(200));
      await writeFile(
        voiceCacheFile(deckDir, "timeline.json"),
        `${JSON.stringify({
          audio: "audio.wav",
          durationMs: 200,
          beats: [
            {
              position: { slideIndex: 0, beatIndex: 0 },
              start: 0,
              end: 200,
              sentences: [{ text: "hello", kana: "ハロー", start: 0, end: 200 }],
            },
          ],
        })}\n`,
      );
      await fn(root, resolveDeck(deckDir));
    },
  );
}
