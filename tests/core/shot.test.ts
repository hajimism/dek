import { describe, expect, test } from "bun:test";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { shotDeck, shotFileName } from "../../src/core/shot.ts";
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
        expect(shots[0]?.path).toMatch(/\/\.cache\/shots\/intro\.[0-9a-f]{8}\.png$/);
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
        expect(shots).toHaveLength(1);
        expect(shots[0]).toMatchObject({ slug: "intro", step: "1" });
        expect(shots[0]?.path).toMatch(/\/\.cache\/shots\/intro-1\.[0-9a-f]{8}\.png$/);
      },
    );
  });

  test("changes the path when theme.css changes and removes the stale file", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml }, theme: ".slide { --fg: #fff; }\n" }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const runner = async (request: VisualRequest) => {
          for (const page of request.pages) {
            if (page.screenshotPath) {
              await Bun.write(page.screenshotPath, "");
            }
          }
          return { overflows: [], contrasts: [] };
        };
        const before = await shotDeck(deckDir, { slug: "intro", runner });
        const again = await shotDeck(deckDir, { slug: "intro", runner });
        expect(again[0]?.path).toBe(before[0]?.path);

        await writeFile(join(deckDir, "theme.css"), ".slide { --fg: #000; }\n");
        const after = await shotDeck(deckDir, { slug: "intro", runner });
        expect(after[0]?.path).not.toBe(before[0]?.path);
        expect(await Bun.file(after[0]?.path ?? "").exists()).toBe(true);
        expect(await Bun.file(before[0]?.path ?? "").exists()).toBe(false);
        const names = await readdir(join(deckDir, ".cache", "shots"));
        expect(names.filter((name) => name.startsWith("intro."))).toHaveLength(1);
      },
    );
  });

  test("removes a legacy intro.png when it shoots the same slide", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const legacy = join(deckDir, ".cache", "shots", "intro.png");
        await Bun.write(legacy, "");
        await shotDeck(deckDir, {
          slug: "intro",
          runner: async (request) => {
            for (const page of request.pages) {
              if (page.screenshotPath) {
                await Bun.write(page.screenshotPath, "");
              }
            }
            return { overflows: [], contrasts: [] };
          },
        });
        expect(await Bun.file(legacy).exists()).toBe(false);
      },
    );
  });
});

describe("shotFileName", () => {
  test("hashes the rendered HTML and keeps the slug and step readable", () => {
    const a = shotFileName("intro", undefined, "<html>a</html>");
    expect(a).toMatch(/^intro\.[0-9a-f]{8}\.png$/);
    expect(shotFileName("intro", undefined, "<html>a</html>")).toBe(a);
    expect(shotFileName("intro", undefined, "<html>b</html>")).not.toBe(a);
    expect(shotFileName("intro", "hook", "<html>a</html>")).toMatch(
      /^intro-hook\.[0-9a-f]{8}\.png$/,
    );
  });
});
