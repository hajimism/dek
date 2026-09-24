import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { renderDeckHtml } from "../../src/core/document.ts";
import { resolvePlaywrightModule } from "../../src/core/playwright.ts";
import type { Timeline } from "../../src/core/timeline.ts";
import { playerScript } from "../../src/runtime/player.ts";
import { defaultVideoRunner } from "../../src/video/recorder.ts";
import { withTempDir } from "../helpers/fs.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const defaultTheme = await Bun.file(new URL("../../src/theme/default.css", import.meta.url)).text();

const skipCapture = resolvePlaywrightModule() === undefined || Boolean(process.env.DEK_VIDEO);

describe("video worker", () => {
  test.serial.skipIf(skipCapture)(
    "captures distinct mid-transition frames between two slides",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "demo",
              theme: defaultTheme,
              script: `---
title: Demo
---

## intro

hello

## next

bye
`,
              slides: {
                intro: slideDocument(`<section class="slide"><h2>AAAA</h2></section>`),
                next: slideDocument(`<section class="slide"><h2>BBBB</h2></section>`),
              },
            },
          ],
        },
        async (root) => {
          const html = await renderDeckHtml(join(root, "decks", "demo"), {
            mode: "video",
            playerScript: await playerScript(),
          });
          const timeline: Timeline = {
            audio: "a.wav",
            durationMs: 4000,
            beats: [
              {
                position: { slideIndex: 0, beatIndex: 0 },
                start: 0,
                end: 1000,
                sentences: [],
              },
              {
                position: { slideIndex: 1, beatIndex: 0 },
                start: 2000,
                end: 3000,
                sentences: [],
              },
            ],
          };
          await withTempDir(async (outDir) => {
            const captured = await defaultVideoRunner({
              html,
              timeline,
              fps: 10,
              viewport: { width: 1280, height: 720 },
              outDir,
            });
            const animation = captured.frames.filter((frame) => frame.kind === "animation");
            expect(animation.length).toBeGreaterThanOrEqual(2);
            const bytes = await Promise.all(
              animation.map((frame) => Bun.file(frame.path).arrayBuffer()),
            );
            for (let i = 1; i < bytes.length; i++) {
              const current = bytes[i];
              const previous = bytes[i - 1];
              if (current === undefined || previous === undefined) {
                throw new Error("expected animation frame bytes");
              }
              expect(Buffer.from(current).equals(Buffer.from(previous))).toBe(false);
            }
            const total = captured.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
            expect(Math.round(total)).toBe(timeline.durationMs);
          });
        },
      );
    },
    30_000,
  );

  test.serial.skipIf(skipCapture)(
    "records a slide whose animation never ends",
    async () => {
      await withTempProject(
        {
          decks: [
            {
              name: "demo",
              theme: `${defaultTheme}
@keyframes pulse { to { opacity: 0.4 } }
.slide .pulse { animation: pulse 1s infinite alternate }`,
              script: `---
title: Demo
---

## intro

hello

## next

bye
`,
              slides: {
                intro: slideDocument(
                  `<section class="slide"><h2 class="pulse">AAAA</h2></section>`,
                ),
                next: slideDocument(`<section class="slide"><h2>BBBB</h2></section>`),
              },
            },
          ],
        },
        async (root) => {
          const html = await renderDeckHtml(join(root, "decks", "demo"), {
            mode: "video",
            playerScript: await playerScript(),
          });
          const timeline: Timeline = {
            audio: "a.wav",
            durationMs: 3000,
            beats: [
              { position: { slideIndex: 0, beatIndex: 0 }, start: 0, end: 1000, sentences: [] },
              { position: { slideIndex: 1, beatIndex: 0 }, start: 1500, end: 2500, sentences: [] },
            ],
          };
          await withTempDir(async (outDir) => {
            const captured = await defaultVideoRunner({
              html,
              timeline,
              fps: 10,
              viewport: { width: 1280, height: 720 },
              outDir,
            });
            const total = captured.frames.reduce((sum, frame) => sum + frame.durationMs, 0);
            expect(Math.round(total)).toBe(timeline.durationMs);
          });
        },
      );
    },
    30_000,
  );
});
