import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { shotDeck } from "../../src/core/shot.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const architectureHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">architecture</h2>
</section>`);

const twoSlideScript = `---
title: Demo
---

## intro

hello

## architecture

body
`;

describe("shotDeck", () => {
  test("captures every slide in one runner call", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: twoSlideScript,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        let calls = 0;
        const shots = await shotDeck(join(root, "decks", "demo"), {
          runner: async (request: VisualRequest) => {
            calls += 1;
            expect(request.pages).toHaveLength(2);
            expect(request.actions).toEqual(["screenshot"]);
            for (const page of request.pages) {
              if (page.screenshotPath) {
                await Bun.write(page.screenshotPath, "");
              }
            }
            return { overflows: [], contrasts: [] };
          },
        });
        expect(calls).toBe(1);
        expect(shots.map((shot) => shot.slug)).toEqual(["intro", "architecture"]);
        expect(shots[0]?.path).toBe(join(root, "decks", "demo", ".cache", "shots", "intro.png"));
      },
    );
  });

  test("shots a parsed deck without re-reading script.md", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const resolved = resolveDeck(join(root, "decks", "demo"));
        await writeFile(join(root, "decks", "demo", "script.md"), "this is not a deck\n");
        const runner = async (request: VisualRequest) => {
          for (const page of request.pages) {
            if (page.screenshotPath) {
              await Bun.write(page.screenshotPath, "");
            }
          }
          return { overflows: [], contrasts: [] };
        };
        await expect(shotDeck(resolved.deck.dir, { runner })).rejects.toThrow(DekError);
        const shots = await shotDeck(resolved, { runner });
        expect(shots.map((shot) => shot.slug)).toEqual(["intro"]);
      },
    );
  });

  test("rejects a numeric step that does not exist on a title slide", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await expect(
          shotDeck(join(root, "decks", "demo"), {
            slug: "intro",
            step: "2",
            runner: async () => ({ overflows: [], contrasts: [] }),
          }),
        ).rejects.toMatchObject({
          name: "DekError",
          message: 'step "2" not found in "intro"',
        });
      },
    );
  });

  test("accepts step 1 on a title slide with no beats", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const shots = await shotDeck(join(root, "decks", "demo"), {
          slug: "intro",
          step: "1",
          runner: async (request) => {
            expect(request.pages).toHaveLength(1);
            const path = request.pages[0]?.screenshotPath;
            if (path) {
              await Bun.write(path, "");
            }
            return { overflows: [], contrasts: [] };
          },
        });
        expect(shots).toEqual([
          {
            slug: "intro",
            step: "1",
            path: join(root, "decks", "demo", ".cache", "shots", "intro-1.png"),
          },
        ]);
      },
    );
  });
});
