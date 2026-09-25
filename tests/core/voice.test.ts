import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import { parseScript } from "../../src/core/parse.ts";
import { DEFAULT_LEAD_MS } from "../../src/core/timeline.ts";
import {
  loadCachedTimeline,
  loadVoiceSettings,
  parseTimelineJson,
  parseUtteranceJson,
  resolveBeatTiming,
  resolveTimelineAudio,
  VOICE_SETUP_HINT,
  voiceCacheFile,
} from "../../src/core/voice.ts";
import { silentWav } from "../../src/voice/wav.ts";
import { withEnv } from "../helpers/env.ts";
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

describe("loadVoiceSettings", () => {
  test("a deck without voice says how to set it up, the same way every command does", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      expect(() => loadVoiceSettings(deckDir)).toThrow(
        expect.objectContaining({
          message: "voice.toml not found",
          path: join(deckDir, "voice", "voice.toml"),
          hint: VOICE_SETUP_HINT,
        }),
      );
      expect(VOICE_SETUP_HINT).toContain("voice/voice.toml");
      expect(VOICE_SETUP_HINT).toContain("https://hajimism.github.io/dek/guide/voice.html#setup");
      expect(VOICE_SETUP_HINT).not.toContain("dek new");
    });
  });

  test("names the missing key when voice.toml lacks speaker", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), 'engine = "voicevox"\n');
      expect(() => loadVoiceSettings(deckDir)).toThrow(/^speaker: /);
    });
  });

  test.each(["voicevox:80@attacker.example", "aivis:1@attacker.example:8080", "voicevox:x"])(
    "refuses engine %s, which reads as local but names another host",
    async (engine) => {
      await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
        const deckDir = join(root, "decks", "demo");
        await mkdir(join(deckDir, "voice"), { recursive: true });
        await writeFile(
          join(deckDir, "voice", "voice.toml"),
          `engine = ${JSON.stringify(engine)}\nspeaker = "a/b"\n`,
        );
        expect(() => loadVoiceSettings(deckDir)).toThrow(/^engine: /);
      });
    },
  );

  test("takes an engine name, a name with a port, or a URL", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      for (const engine of ["aivis", "voicevox:50021", "https://tts.example.com/"]) {
        await writeFile(
          join(deckDir, "voice", "voice.toml"),
          `engine = ${JSON.stringify(engine)}\nspeaker = "a/b"\n`,
        );
        expect(loadVoiceSettings(deckDir).engine).toBe(engine);
      }
    });
  });

  test("reads the deck lead and per-beat timing", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(
        join(deckDir, "voice", "voice.toml"),
        `${voiceToml}lead = 200\n\n[beats."order/what"]\nlead = 600\npause = 1200\n`,
      );
      const settings = loadVoiceSettings(deckDir);
      expect(settings.lead).toBe(200);
      expect(settings.beats).toEqual({ "order/what": { lead: 600, pause: 1200 } });
    });
  });

  test("defaults lead to the shared lead-in and beats to none", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      const settings = loadVoiceSettings(deckDir);
      expect(settings.lead).toBe(DEFAULT_LEAD_MS);
      expect(settings.beats).toEqual({});
    });
  });
});

describe("resolveBeatTiming", () => {
  const deck = parseScript(`---
title: Demo
---

## intro

hello

## order

### what {#what}

first

### sequence {#sequence}

second
`);

  test("addresses a slide by slug, a beat by id or by 1-based position", () => {
    const { timing, unknown } = resolveBeatTiming(deck, {
      lead: 250,
      beats: { intro: { lead: 0 }, "order/sequence": { pause: 1500 }, "order/1": { lead: 700 } },
    });
    expect(unknown).toEqual([]);
    expect(timing({ slideIndex: 0, beatIndex: 0 })).toEqual({ lead: 0 });
    expect(timing({ slideIndex: 1, beatIndex: 0 })).toEqual({ lead: 700 });
    expect(timing({ slideIndex: 1, beatIndex: 1 })).toEqual({ lead: 250, pause: 1500 });
  });

  test("a slide key leads into the slide and pauses after it; a beat key wins", () => {
    const { timing } = resolveBeatTiming(deck, {
      lead: 300,
      beats: { order: { lead: 100, pause: 900 } },
    });
    expect(timing({ slideIndex: 1, beatIndex: 0 })).toEqual({ lead: 100 });
    expect(timing({ slideIndex: 1, beatIndex: 1 })).toEqual({ lead: 300, pause: 900 });

    const refined = resolveBeatTiming(deck, {
      lead: 300,
      beats: {
        order: { lead: 100, pause: 900 },
        "order/what": { lead: 500 },
        "order/sequence": { pause: 1200 },
      },
    }).timing;
    expect(refined({ slideIndex: 1, beatIndex: 0 })).toEqual({ lead: 500 });
    expect(refined({ slideIndex: 1, beatIndex: 1 })).toEqual({ lead: 300, pause: 1200 });
  });

  test("on a one-beat slide, the slide key's lead and pause land on the same beat", () => {
    const { timing } = resolveBeatTiming(deck, {
      lead: 300,
      beats: { intro: { lead: 0, pause: 2000 } },
    });
    expect(timing({ slideIndex: 0, beatIndex: 0 })).toEqual({ lead: 0, pause: 2000 });
  });

  test("reports keys that match no slide or beat", () => {
    const { unknown } = resolveBeatTiming(deck, {
      lead: 300,
      beats: { gone: { lead: 1 }, "order/nope": { lead: 1 }, "order/9": { lead: 1 } },
    });
    expect(unknown).toEqual(["gone", "order/nope", "order/9"]);
  });
});

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

describe("parseUtteranceJson", () => {
  test("returns an Utterance for valid cache JSON", () => {
    expect(
      parseUtteranceJson(JSON.stringify({ text: "hello", kana: "ハロー", durationMs: 12 })),
    ).toEqual({ text: "hello", kana: "ハロー", durationMs: 12 });
  });

  test("returns undefined for JSON that is not an Utterance", () => {
    expect(parseUtteranceJson('{"text":"hello"}')).toBeUndefined();
    expect(parseUtteranceJson("not-json")).toBeUndefined();
  });
});

describe("loadCachedTimeline", () => {
  test("returns undefined when the cache file is missing", async () => {
    await withTempDir(async (dir) => {
      expect(loadCachedTimeline(dir)).toBeUndefined();
    });
  });

  test("throws for JSON that is not a Timeline", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, ".cache", "voice"), { recursive: true });
      await writeFile(join(dir, ".cache", "voice", "timeline.json"), '{"ok":true}\n');
      expect(() => loadCachedTimeline(dir)).toThrow(DekError);
      try {
        loadCachedTimeline(dir);
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("invalid");
        expect((error as DekError).message.toLowerCase()).not.toContain("not found");
      }
    });
  });
});

describe("synthDeck timeline audio", () => {
  test.serial("writes a portable audio filename and restores pin next to the cache", async () => {
    const fake = await startFakeVoicevox();
    try {
      await withEnv({ DEK_VOICE_URL: fake.url }, () =>
        withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
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
            voiceCacheFile(deckDir, "audio.wav"),
          );
        }),
      );
    } finally {
      await fake.close();
    }
  });

  test.serial("bakes voice.toml lead and beat pauses into timeline.json", async () => {
    const fake = await startFakeVoicevox();
    try {
      await withEnv({ DEK_VOICE_URL: fake.url }, () =>
        withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
          const deckDir = join(root, "decks", "demo");
          await mkdir(join(deckDir, "voice"), { recursive: true });
          await writeFile(
            join(deckDir, "voice", "voice.toml"),
            `${voiceToml}\n[beats.intro]\nlead = 0\npause = 2000\n`,
          );
          const { synthDeck } = await import("../../src/voice/synth.ts");
          const result = await synthDeck(deckDir);
          const timeline = parseTimelineJson(await readFile(result.timelinePath, "utf8"));
          expect(timeline.beats[0]?.lead).toBe(0);
          expect(timeline.durationMs - (timeline.beats[0]?.end ?? 0)).toBe(2000);
        }),
      );
    } finally {
      await fake.close();
    }
  });

  test.serial("treats a corrupt utterance cache as a miss", async () => {
    const fake = await startFakeVoicevox();
    try {
      await withEnv({ DEK_VOICE_URL: fake.url }, () =>
        withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
          const deckDir = join(root, "decks", "demo");
          await mkdir(join(deckDir, "voice"), { recursive: true });
          await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
          const { synthDeck } = await import("../../src/voice/synth.ts");
          const first = await synthDeck(deckDir);
          expect(first.synthesized).toBe(1);
          expect(first.cached).toBe(0);

          const cacheDir = join(deckDir, ".cache", "voice");
          const meta = (await readdir(cacheDir)).find(
            (name) =>
              name.endsWith(".json") && name !== "timeline.json" && name !== "resolved.json",
          );
          expect(meta).toBeDefined();
          await writeFile(join(cacheDir, meta ?? ""), '{"text":"hello"}\n');

          const second = await synthDeck(deckDir);
          expect(second.synthesized).toBe(1);
          expect(second.cached).toBe(0);
        }),
      );
    } finally {
      await fake.close();
    }
  });

  test.serial("an engine that answers 500 is reported as such, not as missing", async () => {
    const fake = await startFakeVoicevox();
    fake.failWith = { path: "/speakers", status: 500 };
    try {
      await withEnv({ DEK_VOICE_URL: fake.url }, () =>
        withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
          const deckDir = join(root, "decks", "demo");
          await mkdir(join(deckDir, "voice"), { recursive: true });
          await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
          const { synthDeck } = await import("../../src/voice/synth.ts");
          await expect(synthDeck(deckDir)).rejects.toMatchObject({
            name: "DekError",
            message: expect.stringContaining("500"),
          });
          await expect(synthDeck(deckDir)).rejects.not.toMatchObject({
            message: expect.stringContaining("was not found"),
          });
        }),
      );
    } finally {
      await fake.close();
    }
  });

  test("rejects a pin timeline that is not a Timeline", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice", "pin"), { recursive: true });
      await writeFile(
        join(deckDir, "voice", "pin", "timeline.json"),
        `${JSON.stringify({ not: "a timeline" })}\n`,
      );
      await writeFile(join(deckDir, "voice", "pin", "master.wav"), silentWav(50));
      const { synthDeck } = await import("../../src/voice/synth.ts");
      await expect(synthDeck(deckDir)).rejects.toMatchObject({
        name: "DekError",
        message: "invalid timeline.json",
      });
      expect(existsSync(voiceCacheFile(deckDir, "timeline.json"))).toBe(false);
    });
  });
});
