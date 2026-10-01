import { describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkCommand } from "../../src/cli/check.ts";
import { requireDeckFromCwd } from "../../src/cli/scope.ts";
import { addReading, listSpeakers, pinVoice, sayVoice, synthVoice } from "../../src/cli/voice.ts";
import { DekcError } from "../../src/core/error.ts";
import { loadVoiceDict } from "../../src/core/voice.ts";
import { jsonStdout, runDekc } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { type FakeVoicevox, startFakeVoicevox } from "../helpers/fake-voicevox.ts";
import { withTempProject } from "../helpers/project.ts";

const script = `---
title: Demo
---

## intro

hello dekc
`;

const voiceToml = `engine = "voicevox"
speaker = "ずんだもん/ノーマル"
speed = 1
`;

async function withVoiceDeck(
  fn: (root: string, deckDir: string, fake: FakeVoicevox) => Promise<void>,
  toml = voiceToml,
): Promise<void> {
  const fake = await startFakeVoicevox();
  try {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), toml);
      await withEnv({ DEKC_VOICE_URL: fake.url, DEKC_VOICE_PLAY: "0" }, () =>
        fn(root, deckDir, fake),
      );
    });
  } finally {
    await fake.close();
  }
}

describe("dekc voice", () => {
  test("fails with a next step when the engine is down", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      const result = await runDekc(["voice", "--json"], {
        cwd: deckDir,
        env: { DEKC_VOICE_URL: "http://127.0.0.1:9" },
      });
      expect(result).toMatchObject({ exitCode: 1 });
      const json = jsonStdout<{ ok: false; error: { message: string; hint?: string } }>(result);
      expect(json.error.message).toContain("voicevox");
      expect(json.error.hint).toContain("https://voicevox.hiroshiba.jp/");
      expect(json.error.hint).toContain("docker run");
    });
  });

  test("adds a dictionary entry as JSON", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      const result = await runDekc(
        ["voice", "dict", "add", "dekc", "デック", "--accent", "1", "--json"],
        { cwd: deckDir },
      );
      expect(result).toMatchObject({ exitCode: 0 });
      const json = jsonStdout<{ ok: true; key: string; kana: string; path: string }>(result);
      expect(json.key).toBe("dekc");
      expect(json.kana).toBe("デック");
      expect(await Bun.file(json.path).text()).toContain("accent = 1");
    });
  });
});

describe("dekc voice and its subcommands", () => {
  test.serial("synthesizes changed sentences and reuses the cache", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      const first = await synthVoice(requireDeckFromCwd(deckDir));
      if (first.action !== "synth") {
        throw new Error("expected synth");
      }
      expect(first.synthesized).toBe(1);
      expect(first.cached).toBe(0);
      const timeline = JSON.parse(
        await Bun.file(join(deckDir, ".cache", "voice", "timeline.json")).text(),
      ) as { audio: string };
      expect(timeline.audio).toBe("audio.wav");

      const second = await synthVoice(requireDeckFromCwd(deckDir));
      if (second.action !== "synth") {
        throw new Error("expected synth");
      }
      expect(second.synthesized).toBe(0);
      expect(second.cached).toBe(1);
    });
  });

  test.serial("lists speakers", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      const result = await listSpeakers(requireDeckFromCwd(deckDir));
      if (result.action !== "speakers") {
        throw new Error("expected speakers");
      }
      expect(result.speakers[0]?.name).toBe("ずんだもん");
    });
  });

  test.serial("pins TTS master.wav and timeline.json", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      const synth = await synthVoice(requireDeckFromCwd(deckDir));
      expect(synth.action).toBe("synth");
      const pin = pinVoice(requireDeckFromCwd(deckDir));
      if (pin.action !== "pin") {
        throw new Error("expected pin");
      }
      expect(pin.audioPath.endsWith("voice/pin/master.wav")).toBe(true);
      expect(await Bun.file(pin.audioPath).exists()).toBe(true);
      expect(await Bun.file(pin.timelinePath).exists()).toBe(true);
      await withEnv({ DEKC_VOICE_URL: "http://127.0.0.1:9", DEKC_VOICE_PLAY: "0" }, async () => {
        const again = await synthVoice(requireDeckFromCwd(deckDir));
        expect(again.action).toBe("synth");
      });
    });
  });

  test.serial("says one sentence in the deck's speaker and speed, kept at say.wav", async () => {
    await withVoiceDeck(
      async (_root, deckDir, fake) => {
        const result = await sayVoice(requireDeckFromCwd(deckDir), "こんにちは");
        expect(result).toEqual({
          action: "say",
          text: "こんにちは",
          path: join(deckDir, ".cache", "voice", "say.wav"),
        });
        expect(fake.queries).toEqual(["こんにちは"]);
        expect(fake.syntheses).toEqual([{ speaker: 3, speedScale: 1.25 }]);
        const wav = new Uint8Array(
          await Bun.file(join(deckDir, ".cache", "voice", "say.wav")).arrayBuffer(),
        );
        expect(new TextDecoder().decode(wav.slice(0, 4))).toBe("RIFF");
      },
      voiceToml.replace("speed = 1", "speed = 1.25"),
    );
  });

  test.serial("adds a reading beside the others, and a new one replaces the old", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      const target = requireDeckFromCwd(deckDir);
      addReading(target, { word: "dekc", kana: "デック", accent: 1 });
      const result = addReading(target, { word: "TOML", kana: "トムル" });
      expect(result).toEqual({
        action: "dict",
        path: join(deckDir, "voice", "dict.toml"),
        key: "TOML",
        kana: "トムル",
      });
      addReading(target, { word: "dekc", kana: "デク" });
      expect(loadVoiceDict(deckDir)).toEqual({ TOML: { kana: "トムル" }, dekc: { kana: "デク" } });
    });
  });

  test.serial("pin asks for `dekc voice` when nothing has been synthesized", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      expect(() => pinVoice(requireDeckFromCwd(deckDir))).toThrow(
        expect.objectContaining({ message: "Timeline not found", hint: "run `dekc voice`" }),
      );
    });
  });

  test.serial("pin refuses a link planted in the cache in place of the audio", async () => {
    await withVoiceDeck(async (root, deckDir) => {
      await synthVoice(requireDeckFromCwd(deckDir));
      const audio = join(deckDir, ".cache", "voice", "audio.wav");
      const secret = join(root, "secret.txt");
      await writeFile(secret, "not audio");
      await Bun.file(audio).delete();
      await symlink(secret, audio);
      expect(() => pinVoice(requireDeckFromCwd(deckDir))).toThrow("Timeline not found");
      expect(await Bun.file(join(deckDir, "voice", "pin", "master.wav")).exists()).toBe(false);
    });
  });

  test.serial("voice speakers gives the same setup hint when the engine is down", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(
        join(deckDir, "voice", "voice.toml"),
        voiceToml.replace('"voicevox"', '"aivis"'),
      );
      await withEnv({ DEKC_VOICE_URL: "http://127.0.0.1:9" }, async () => {
        try {
          await listSpeakers(requireDeckFromCwd(deckDir));
          throw new Error("expected DekcError");
        } catch (error) {
          expect(error).toBeInstanceOf(DekcError);
          expect((error as DekcError).message).toContain("aivis");
          expect((error as DekcError).hint).toContain("https://aivis-project.com/");
        }
      });
    });
  });
});

describe("checkCommand --voice", () => {
  test.serial("returns kana and duration", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      const result = await checkCommand(requireDeckFromCwd(deckDir), {
        slug: "intro",
        voice: true,
      });
      expect(result.voice?.beats[0]?.sentences[0]?.kana).toContain("カナ");
      expect(result.diagnostics.some((diagnostic) => diagnostic.id === "DEKC040")).toBe(true);
    });
  });
});
