import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Timeline } from "../../src/core/timeline.ts";
import { ffmpegResolved } from "../../src/video/mux.ts";
import { writeVideoSidecars } from "../../src/video/sidecar.ts";
import { silentWav } from "../../src/voice/wav.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { startFakeVoicevox } from "../helpers/fake-voicevox.ts";
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
    const { withTempDir } = await import("../helpers/fs.ts");
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
    const { withTempDir } = await import("../helpers/fs.ts");
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

  test("errors when Timeline JSON is invalid", async () => {
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "voice"), { recursive: true });
      await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
      const cacheDir = join(deckDir, ".cache", "voice");
      await mkdir(cacheDir, { recursive: true });
      await writeFile(join(cacheDir, "timeline.json"), '{"ok":true}\n');
      const result = await runDek(["video", "--json"], { cwd: deckDir });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.toLowerCase()).toContain("invalid");
      expect(result.stdout.toLowerCase()).not.toContain("not found");
    });
  });

  test("bakes dist/<deck>.mp4 when ffmpeg is available", async () => {
    if (!ffmpegResolved()) {
      return;
    }
    const fake = await startFakeVoicevox();
    try {
      await withTempProject(
        { decks: [{ name: "demo", script, slides: { intro: introHtml } }] },
        async (root) => {
          const deckDir = join(root, "decks", "demo");
          await mkdir(join(deckDir, "voice"), { recursive: true });
          await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
          const env = {
            DEK_VOICE_URL: fake.url,
            DEK_VOICE_PLAY: "0",
            DEK_VIDEO: join(import.meta.dir, "../helpers/fake-video.ts"),
          };
          const voice = await runDek(["voice", "--json"], { cwd: deckDir, env });
          expect(voice.exitCode).toBe(0);
          const result = await runDek(["video", "--json"], { cwd: deckDir, env });
          expect(result.exitCode).toBe(0);
          const json = jsonStdout<{ ok: true; out: string; vtt: string }>(result);
          expect(json.out).toBe(join(deckDir, "dist", "demo.mp4"));
          expect(await Bun.file(json.out).exists()).toBe(true);
          expect(await Bun.file(json.vtt).text()).toContain("WEBVTT");
        },
      );
    } finally {
      await fake.close();
    }
  });

  test("writes one slide under .cache/video/", async () => {
    if (!ffmpegResolved()) {
      return;
    }
    const fake = await startFakeVoicevox();
    try {
      await withTempProject(
        { decks: [{ name: "demo", script, slides: { intro: introHtml } }] },
        async (root) => {
          const deckDir = join(root, "decks", "demo");
          await mkdir(join(deckDir, "voice"), { recursive: true });
          await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
          const env = {
            DEK_VOICE_URL: fake.url,
            DEK_VOICE_PLAY: "0",
            DEK_VIDEO: join(import.meta.dir, "../helpers/fake-video.ts"),
          };
          expect((await runDek(["voice", "--json"], { cwd: deckDir, env })).exitCode).toBe(0);
          const result = await runDek(["video", "intro", "--json"], { cwd: deckDir, env });
          expect(result.exitCode).toBe(0);
          const json = jsonStdout<{ ok: true; out: string }>(result);
          expect(json.out).toBe(join(deckDir, ".cache", "video", "intro.mp4"));
          expect(await Bun.file(json.out).exists()).toBe(true);
        },
      );
    } finally {
      await fake.close();
    }
  });

  test("writes project dist/<deck>.mp4 with --root-dist", async () => {
    if (!ffmpegResolved()) {
      return;
    }
    const fake = await startFakeVoicevox();
    try {
      await withTempProject(
        { decks: [{ name: "demo", script, slides: { intro: introHtml } }] },
        async (root) => {
          const deckDir = join(root, "decks", "demo");
          await mkdir(join(deckDir, "voice"), { recursive: true });
          await writeFile(join(deckDir, "voice", "voice.toml"), voiceToml);
          const env = {
            DEK_VOICE_URL: fake.url,
            DEK_VOICE_PLAY: "0",
            DEK_VIDEO: join(import.meta.dir, "../helpers/fake-video.ts"),
          };
          expect((await runDek(["voice", "--json"], { cwd: deckDir, env })).exitCode).toBe(0);
          const result = await runDek(["video", "--json", "--root-dist"], { cwd: deckDir, env });
          expect(result.exitCode).toBe(0);
          const json = jsonStdout<{ ok: true; out: string; vtt: string }>(result);
          expect(json.out).toBe(join(root, "dist", "demo.mp4"));
          expect(json.vtt).toBe(join(root, "dist", "demo.vtt"));
          expect(await Bun.file(json.out).exists()).toBe(true);
        },
      );
    } finally {
      await fake.close();
    }
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

  test("fails when the video worker exits non-zero", async () => {
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
          env: { DEK_VIDEO: join(import.meta.dir, "../helpers/fake-video-fail.ts") },
        });
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("video capture failed");
      },
    );
  });
});
