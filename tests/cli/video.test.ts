import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { videoCommand } from "../../src/cli/video.ts";
import { DekError } from "../../src/core/error.ts";
import type { Timeline } from "../../src/core/timeline.ts";
import { writeVideoSidecars } from "../../src/video/sidecar.ts";
import { silentWav } from "../../src/voice/wav.ts";
import { runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const script = `---
title: Demo
---

## intro

hello
`;

const voiceToml = `engine = "voicevox"
speaker = "ずんだもん/ノーマル"
speed = 1
`;

describe("sidecars", () => {
  test("writes vtt, chapters, and credits", async () => {
    await withTempDir(async (dir) => {
      const stem = join(dir, "demo");
      const paths = writeVideoSidecars({
        timeline: {
          audio: "",
          durationMs: 1000,
          beats: [
            {
              position: { slideIndex: 0, beatIndex: 0 },
              start: 0,
              end: 1000,
              sentences: [{ text: "hello", kana: "ハロー", start: 0, end: 1000 }],
            },
          ],
        },
        titles: [{ slug: "intro", title: "intro", startMs: 0 }],
        speaker: "ずんだもん/ノーマル",
        engine: "voicevox",
        stem,
      });
      expect(await Bun.file(paths.vtt).text()).toContain("hello");
      expect(await Bun.file(paths.chapters).text()).toContain("intro");
      expect(await Bun.file(paths.credits).text()).toContain("ずんだもん");
    });
  });

  test("escapes cue text and collapses newlines", async () => {
    await withTempDir(async (dir) => {
      const stem = join(dir, "demo");
      const paths = writeVideoSidecars({
        timeline: {
          audio: "",
          durationMs: 1000,
          beats: [
            {
              position: { slideIndex: 0, beatIndex: 0 },
              start: 0,
              end: 1000,
              sentences: [
                { text: "hello\nworld", kana: "ハロー", start: 0, end: 500 },
                { text: "a < b & c", kana: "エー", start: 500, end: 1000 },
              ],
            },
          ],
        },
        titles: [{ slug: "intro", title: "intro", startMs: 0 }],
        speaker: "ずんだもん/ノーマル",
        engine: "voicevox",
        stem,
      });
      const vtt = await Bun.file(paths.vtt).text();
      expect(vtt).toContain("hello world");
      expect(vtt).not.toMatch(/hello\nworld/);
      expect(vtt).toContain("a &lt; b &amp; c");
      const cues = vtt.split("\n\n").filter((block) => block && block !== "WEBVTT");
      expect(cues).toHaveLength(2);
    });
  });
});

describe("dek video", () => {
  test("errors when Timeline is missing", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      const result = await runDek(["video", "--json"], { cwd: deckDir });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("dek voice");
    });
  });

  test("fails when Playwright is not installed", async () => {
    const { playwrightResolved } = await import("../../src/core/playwright.ts");
    if (playwrightResolved()) {
      return;
    }
    await withTempProject(
      { decks: [{ name: "demo", script, slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await mkdir(join(deckDir, "voice"), { recursive: true });
        await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
        const cacheDir = join(deckDir, ".cache", "voice");
        await mkdir(cacheDir, { recursive: true });
        const audio = join(cacheDir, "audio.wav");
        await writeFile(audio, silentWav(500));
        await writeFile(
          join(cacheDir, "timeline.json"),
          `${JSON.stringify({
            audio,
            durationMs: 500,
            beats: [
              {
                position: { slideIndex: 0, beatIndex: 0 },
                start: 0,
                end: 500,
                sentences: [{ text: "hello", kana: "ハロー", start: 0, end: 500 }],
              },
            ],
          } satisfies Timeline)}\n`,
        );
        const result = await runDek(["video", "--json"], {
          cwd: deckDir,
          env: { DEK_VIDEO: "" },
        });
        expect(result.exitCode).toBe(1);
        expect(`${result.stdout}${result.stderr}`).toContain("Playwright");
      },
    );
  });
});

describe("videoCommand", () => {
  test("errors when Timeline JSON is invalid", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      const cacheDir = join(deckDir, ".cache", "voice");
      await mkdir(cacheDir, { recursive: true });
      await writeFile(join(cacheDir, "timeline.json"), '{"ok":true}\n');
      await expect(videoCommand({ cwd: deckDir })).rejects.toMatchObject({
        name: "DekError",
        message: expect.stringMatching(/invalid/i),
      });
      try {
        await videoCommand({ cwd: deckDir });
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message.toLowerCase()).not.toContain("not found");
      }
    });
  });
});
