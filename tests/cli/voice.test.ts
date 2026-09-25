import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { checkCommand } from "../../src/cli/check.ts";
import { voiceCommand } from "../../src/cli/voice.ts";
import { DekError } from "../../src/core/error.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { startFakeVoicevox } from "../helpers/fake-voicevox.ts";
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

async function withVoiceDeck(fn: (root: string, deckDir: string) => Promise<void>): Promise<void> {
  const fake = await startFakeVoicevox();
  try {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      await withEnv({ DEK_VOICE_URL: fake.url, DEK_VOICE_PLAY: "0" }, () => fn(root, deckDir));
    });
  } finally {
    await fake.close();
  }
}

describe("dek voice", () => {
  test("fails with a next step when the engine is down", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      const result = await runDek(["voice", "--json"], {
        cwd: deckDir,
        env: { DEK_VOICE_URL: "http://127.0.0.1:9" },
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
      const result = await runDek(["voice", "dict", "add", "dek", "デック", "--json"], {
        cwd: deckDir,
      });
      expect(result).toMatchObject({ exitCode: 0 });
      const json = jsonStdout<{ ok: true; key: string; kana: string }>(result);
      expect(json.key).toBe("dek");
      expect(json.kana).toBe("デック");
    });
  });
});

describe("voiceCommand", () => {
  test.serial("synthesizes changed sentences and reuses the cache", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      const first = await voiceCommand({ cwd: deckDir });
      if (first.action !== "synth") {
        throw new Error("expected synth");
      }
      expect(first.synthesized).toBe(1);
      expect(first.cached).toBe(0);
      const timeline = JSON.parse(
        await Bun.file(join(deckDir, ".cache", "voice", "timeline.json")).text(),
      ) as { audio: string };
      expect(timeline.audio).toBe("audio.wav");

      const second = await voiceCommand({ cwd: deckDir });
      if (second.action !== "synth") {
        throw new Error("expected synth");
      }
      expect(second.synthesized).toBe(0);
      expect(second.cached).toBe(1);
    });
  });

  test.serial("lists speakers", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      const result = await voiceCommand({ cwd: deckDir, sub: "speakers" });
      if (result.action !== "speakers") {
        throw new Error("expected speakers");
      }
      expect(result.speakers[0]?.name).toBe("ずんだもん");
    });
  });

  test.serial("pins TTS master.wav and timeline.json", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      const synth = await voiceCommand({ cwd: deckDir });
      expect(synth.action).toBe("synth");
      const pin = await voiceCommand({ cwd: deckDir, sub: "pin" });
      if (pin.action !== "pin") {
        throw new Error("expected pin");
      }
      expect(pin.audioPath.endsWith("voice/pin/master.wav")).toBe(true);
      expect(await Bun.file(pin.audioPath).exists()).toBe(true);
      expect(await Bun.file(pin.timelinePath).exists()).toBe(true);
      await withEnv({ DEK_VOICE_URL: "http://127.0.0.1:9", DEK_VOICE_PLAY: "0" }, async () => {
        const again = await voiceCommand({ cwd: deckDir });
        expect(again.action).toBe("synth");
      });
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
      await withEnv({ DEK_VOICE_URL: "http://127.0.0.1:9" }, async () => {
        try {
          await voiceCommand({ cwd: deckDir, sub: "speakers" });
          throw new Error("expected DekError");
        } catch (error) {
          expect(error).toBeInstanceOf(DekError);
          expect((error as DekError).message).toContain("aivis");
          expect((error as DekError).hint).toContain("https://aivis-project.com/");
        }
      });
    });
  });
});

describe("checkCommand --voice", () => {
  test.serial("returns kana and duration", async () => {
    await withVoiceDeck(async (_root, deckDir) => {
      const result = await checkCommand({ cwd: deckDir, slug: "intro", voice: true });
      expect(result.voice?.beats[0]?.sentences[0]?.kana).toContain("カナ");
      expect(result.diagnostics.some((diagnostic) => diagnostic.id === "DEK040")).toBe(true);
    });
  });
});
