import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../../src/core/config.ts";
import { loadVoiceSettings } from "../../src/core/voice.ts";
import { configHint } from "../../src/core/zod.ts";
import { withTempDir } from "../helpers/fs.ts";

const docs = "https://hajimism.github.io/dek/reference/config.html";

async function voiceError(toml: string): Promise<unknown> {
  return withTempDir(async (dir) => {
    await mkdir(join(dir, "voice"), { recursive: true });
    await writeFile(join(dir, "voice", "voice.toml"), toml);
    try {
      loadVoiceSettings(dir);
    } catch (error) {
      return error;
    }
    throw new Error("expected loadVoiceSettings to throw");
  });
}

describe("config errors", () => {
  test("a missing voice.toml key is named as required, with the reference as hint", async () => {
    expect(await voiceError('engine = "voicevox"\n')).toMatchObject({
      message: "speaker: required",
      hint: `see ${docs}#voice-voice-toml`,
    });
  });

  test("a TOML syntax error says where it is", async () => {
    const error = (await voiceError('engine = "voicevox\n')) as { message: string; hint?: string };
    expect(error.message).toMatch(/^invalid voice\.toml: .+/);
    expect(error.hint).toBe(`see ${docs}#voice-voice-toml`);
  });

  test("dek.toml errors point at its section of the reference", async () => {
    await withTempDir(async (dir) => {
      const path = join(dir, "dek.toml");
      await writeFile(path, 'max_classes = "many"\n');
      expect(() => loadConfig(path)).toThrow(
        expect.objectContaining({ hint: `see ${docs}#dek-toml` }),
      );
    });
  });
});

describe("configHint", () => {
  test("every anchor it links is a heading in the configuration reference", async () => {
    const reference = await readFile(
      join(import.meta.dir, "..", "..", "docs", "reference", "config.md"),
      "utf8",
    );
    // VitePress slugs: backticks dropped, punctuation to "-", lowercased.
    const anchors = new Set(
      [...reference.matchAll(/^##+ (.+)$/gm)].map((m) =>
        (m[1] ?? "")
          .replaceAll("`", "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, ""),
      ),
    );
    for (const anchor of [
      "dek-toml",
      "frontmatter",
      "voice-voice-toml",
      "voice-dict-toml",
    ] as const) {
      expect(anchors.has(configHint(anchor).split("#")[1] ?? "")).toBe(true);
    }
  });
});
