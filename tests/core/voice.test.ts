import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import { loadCachedTimeline, resolveTimelineAudio, voiceCacheFile } from "../../src/core/voice.ts";
import { silentWav } from "../../src/voice/wav.ts";
import { startFakeVoicevox } from "../helpers/fake-voicevox.ts";
import { withTempDir } from "../helpers/fs.ts";
import { withTempProject } from "../helpers/project.ts";

const script = `---
title: Demo
---

## intro

hello dek
`;

const voiceToml = `engine = "voicevox"
speaker = "ずんだもん/ノーマル"
speed = 1
`;

describe("resolveTimelineAudio", () => {
  test("resolves a relative audio name beside timeline.json", async () => {
    await withTempDir(async (dir) => {
      const timelinePath = join(dir, "timeline.json");
      const audioPath = join(dir, "audio.wav");
      await writeFile(audioPath, silentWav(100));
      expect(resolveTimelineAudio({ audio: "audio.wav" }, timelinePath)).toBe(audioPath);
    });
  });

  test("keeps an absolute audio path when that file still exists", async () => {
    await withTempDir(async (dir) => {
      const timelinePath = join(dir, "timeline.json");
      const audioPath = join(dir, "master.wav");
      await writeFile(audioPath, silentWav(100));
      expect(resolveTimelineAudio({ audio: audioPath }, timelinePath)).toBe(audioPath);
    });
  });

  test("falls back beside timeline.json when an absolute path is stale", async () => {
    await withTempDir(async (dir) => {
      const timelinePath = join(dir, "timeline.json");
      await writeFile(join(dir, "audio.wav"), silentWav(100));
      const resolved = resolveTimelineAudio({ audio: "/no/such/moved/audio.wav" }, timelinePath);
      expect(resolved).toBe(join(dir, "audio.wav"));
    });
  });
});

describe("loadCachedTimeline", () => {
  test("returns undefined when the cache file is missing", async () => {
    await withTempDir(async (dir) => {
      expect(loadCachedTimeline(dir, "demo")).toBeUndefined();
    });
  });

  test("throws for JSON that is not a Timeline", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, ".dek", "voice", "demo"), { recursive: true });
      await writeFile(join(dir, ".dek", "voice", "demo", "timeline.json"), '{"ok":true}\n');
      expect(() => loadCachedTimeline(dir, "demo")).toThrow(DekError);
      try {
        loadCachedTimeline(dir, "demo");
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("invalid");
        expect((error as DekError).message.toLowerCase()).not.toContain("not found");
      }
    });
  });
});

describe("synthDeck timeline audio", () => {
  test("writes a portable audio filename and restores pin next to the cache", async () => {
    const fake = await startFakeVoicevox();
    const previous = process.env.DEK_VOICE_URL;
    process.env.DEK_VOICE_URL = fake.url;
    try {
      await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
        const deckDir = join(root, "decks", "demo");
        await mkdir(join(deckDir, "voice"), { recursive: true });
        await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
        const { synthDeck } = await import("../../src/voice/synth.ts");
        const result = await synthDeck(deckDir);
        const timeline = JSON.parse(await readFile(result.timelinePath, "utf8")) as {
          audio: string;
        };
        expect(timeline.audio).toBe("audio.wav");
        expect(isAbsolute(timeline.audio)).toBe(false);

        await mkdir(join(deckDir, "voice", "pin"), { recursive: true });
        await writeFile(
          join(deckDir, "voice", "pin", "timeline.json"),
          `${JSON.stringify({ audio: "/old/machine/audio.wav", durationMs: 1, beats: [] }, null, 2)}\n`,
        );
        await writeFile(join(deckDir, "voice", "pin", "master.wav"), silentWav(50));
        const restored = await synthDeck(deckDir);
        expect(restored.synthesized).toBe(0);
        const pinned = JSON.parse(await readFile(restored.timelinePath, "utf8")) as {
          audio: string;
        };
        expect(pinned.audio).toBe("audio.wav");
        expect(resolveTimelineAudio(pinned, restored.timelinePath)).toBe(
          voiceCacheFile(root, "demo", "audio.wav"),
        );
      });
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_VOICE_URL;
      } else {
        process.env.DEK_VOICE_URL = previous;
      }
      await fake.close();
    }
  });
});
