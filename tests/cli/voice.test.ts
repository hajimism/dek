import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonStdout, runDek } from "../helpers/cli.ts";
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

async function withVoiceDeck(
  fn: (root: string, deckDir: string, env: Record<string, string>) => Promise<void>,
): Promise<void> {
  const fake = await startFakeVoicevox();
  try {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      await fn(root, deckDir, {
        DEK_VOICE_URL: fake.url,
        DEK_VOICE_PLAY: "0",
      });
    });
  } finally {
    await fake.close();
  }
}

describe("dek voice", () => {
  test("synthesizes changed sentences and reuses the cache", async () => {
    await withVoiceDeck(async (_root, deckDir, env) => {
      const first = await runDek(["voice", "--json"], { cwd: deckDir, env });
      expect(first.exitCode).toBe(0);
      const firstJson = jsonStdout<{ ok: true; synthesized: number; cached: number }>(first);
      expect(firstJson.synthesized).toBe(1);
      expect(firstJson.cached).toBe(0);
      const timeline = JSON.parse(
        await Bun.file(join(_root, ".dek", "voice", "demo", "timeline.json")).text(),
      ) as { audio: string };
      expect(timeline.audio).toBe("audio.wav");

      const second = await runDek(["voice", "--json"], { cwd: deckDir, env });
      expect(second.exitCode).toBe(0);
      const secondJson = jsonStdout<{ ok: true; synthesized: number; cached: number }>(second);
      expect(secondJson.synthesized).toBe(0);
      expect(secondJson.cached).toBe(1);
    });
  });

  test("lists speakers", async () => {
    await withVoiceDeck(async (_root, deckDir, env) => {
      const result = await runDek(["voice", "speakers", "--json"], { cwd: deckDir, env });
      expect(result.exitCode).toBe(0);
      const json = jsonStdout<{ ok: true; speakers: Array<{ name: string }> }>(result);
      expect(json.speakers[0]?.name).toBe("ずんだもん");
    });
  });

  test("adds a dictionary entry", async () => {
    await withVoiceDeck(async (_root, deckDir, env) => {
      const result = await runDek(["voice", "dict", "add", "dek", "デック", "--json"], {
        cwd: deckDir,
        env,
      });
      expect(result.exitCode).toBe(0);
      const json = jsonStdout<{ ok: true; key: string; kana: string }>(result);
      expect(json.key).toBe("dek");
      expect(json.kana).toBe("デック");
    });
  });

  test("pins TTS master.wav and timeline.json", async () => {
    await withVoiceDeck(async (_root, deckDir, env) => {
      const synth = await runDek(["voice", "--json"], { cwd: deckDir, env });
      expect(synth.exitCode).toBe(0);
      const pin = await runDek(["voice", "pin", "--json"], { cwd: deckDir, env });
      expect(pin.exitCode).toBe(0);
      const json = jsonStdout<{ ok: true; audioPath: string; timelinePath: string }>(pin);
      expect(json.audioPath.endsWith("voice/pin/master.wav")).toBe(true);
      expect(await Bun.file(json.audioPath).exists()).toBe(true);
      expect(await Bun.file(json.timelinePath).exists()).toBe(true);
      const again = await runDek(["voice", "--json"], {
        cwd: deckDir,
        env: { DEK_VOICE_URL: "http://127.0.0.1:9", DEK_VOICE_PLAY: "0" },
      });
      expect(again.exitCode).toBe(0);
    });
  });

  test("fails with a next step when the engine is down", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      const result = await runDek(["voice", "--json"], {
        cwd: deckDir,
        env: { DEK_VOICE_URL: "http://127.0.0.1:9" },
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("hint");
    });
  });
});

describe("dek check --voice", () => {
  test("returns kana and duration as JSON", async () => {
    await withVoiceDeck(async (_root, deckDir, env) => {
      const result = await runDek(["check", "intro", "--voice", "--json"], { cwd: deckDir, env });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<{
        ok: true;
        voice: { beats: Array<{ sentences: Array<{ kana: string }> }> };
        diagnostics: Array<{ id: string }>;
      }>(result);
      expect(json.voice.beats[0]?.sentences[0]?.kana).toContain("カナ");
      expect(json.diagnostics.some((diagnostic) => diagnostic.id === "DEK040")).toBe(true);
    });
  });
});
