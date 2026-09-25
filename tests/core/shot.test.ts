import { describe, expect, test } from "bun:test";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { shotDeck, shotFileName, shotMorph } from "../../src/core/shot.ts";
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
          hint: "this slide has no beats; use 1, or leave out --step",
        });
      },
    );
  });

  test("names the beats a missing step could have been", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n\n### hook\n\na\n\n### turn\n\nb\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        await expect(
          shotDeck(join(root, "decks", "demo"), {
            slug: "intro",
            step: "nope",
            runner: async () => ({ overflows: [], contrasts: [] }),
          }),
        ).rejects.toMatchObject({ hint: "use hook, turn, or 1-2" });
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

  test("shoots only the slides whose rendering changed since their last shot", async () => {
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
        const deckDir = join(root, "decks", "demo");
        const shotSlugs: string[][] = [];
        const runner = async (request: VisualRequest) => {
          shotSlugs.push(request.pages.map((page) => page.slug ?? ""));
          for (const page of request.pages) {
            if (page.screenshotPath) {
              await Bun.write(page.screenshotPath, "");
            }
          }
          return { overflows: [], contrasts: [] };
        };
        const first = await shotDeck(deckDir, { runner });
        await writeFile(
          join(deckDir, "slides", "architecture.html"),
          architectureHtml.replace("architecture</h2>", "the architecture</h2>"),
        );
        const second = await shotDeck(deckDir, { runner });
        expect(shotSlugs).toEqual([["intro", "architecture"], ["architecture"]]);
        expect(second.map((shot) => shot.slug)).toEqual(["intro", "architecture"]);
        expect(second[0]?.path).toBe(first[0]?.path);
      },
    );
  });

  test("needs no browser when every shot is already on disk", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const [shot] = await shotDeck(deckDir, {
          runner: async (request) => {
            for (const page of request.pages) {
              if (page.screenshotPath) {
                await Bun.write(page.screenshotPath, "");
              }
            }
            return { overflows: [], contrasts: [] };
          },
        });
        // A runner that answers null is one without Playwright.
        const again = await shotDeck(deckDir, { runner: async () => null });
        expect(again).toEqual([{ slug: "intro", step: "1", path: shot?.path ?? "" }]);
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

describe("shotMorph", () => {
  const morphScript = `---
title: Demo
---

## problem

### one {#one}

first

### two {#two}

second

## architecture

body
`;
  const problemHtml = slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">problem</h2>
  <p class="node" data-morph="pipeline" data-step="one">a</p>
  <p class="node" data-step="two">b</p>
</section>`);
  const morphedHtml = slideDocument(`<section class="slide" data-layout="title">
  <p class="node node-parent" data-morph="pipeline">a</p>
</section>`);

  test("asks the runner for one morph frame between the last beat of a and beat 0 of b", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: morphScript,
            slides: { problem: problemHtml, architecture: morphedHtml },
          },
        ],
      },
      async (root) => {
        const requests: VisualRequest[] = [];
        const shots = await shotMorph(join(root, "decks", "demo"), {
          from: "problem",
          to: "architecture",
          at: 0.5,
          playerScript: "/* player */",
          runner: async (request) => {
            requests.push(request);
            for (const page of request.pages) {
              if (page.screenshotPath) {
                await Bun.write(page.screenshotPath, "");
              }
            }
            return { overflows: [], contrasts: [] };
          },
        });
        expect(requests).toHaveLength(1);
        const request = requests[0];
        expect(request?.actions).toEqual(["morph"]);
        expect(request?.morph).toEqual({
          from: { slideIndex: 0, beatIndex: 1 },
          to: { slideIndex: 1, beatIndex: 0 },
          at: 0.5,
        });
        expect(request?.pages).toHaveLength(1);
        expect(request?.pages[0]?.html).toContain('data-slug="problem"');
        expect(request?.pages[0]?.html).toContain('data-slug="architecture"');
        expect(request?.pages[0]?.html).toContain("/* player */");
        expect(shots).toHaveLength(1);
        expect(shots[0]).toMatchObject({ slug: "problem", to: "architecture", at: 0.5 });
        expect(shots[0]?.path).toMatch(
          /\/\.cache\/shots\/problem-to-architecture-0\.5\.[0-9a-f]{8}\.png$/,
        );
        expect(await Bun.file(shots[0]?.path ?? "").exists()).toBe(true);
      },
    );
  });

  test("takes a frame once, and again only at another --at", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: morphScript,
            slides: { problem: problemHtml, architecture: morphedHtml },
          },
        ],
      },
      async (root) => {
        const taken: number[] = [];
        const shoot = (at: number) =>
          shotMorph(join(root, "decks", "demo"), {
            from: "problem",
            to: "architecture",
            at,
            playerScript: "/* player */",
            runner: async (request) => {
              taken.push(request.morph?.at ?? -1);
              for (const page of request.pages) {
                if (page.screenshotPath) {
                  await Bun.write(page.screenshotPath, "");
                }
              }
              return { overflows: [], contrasts: [] };
            },
          });
        const [first] = await shoot(0.5);
        const [again] = await shoot(0.5);
        await shoot(0.25);
        expect(taken).toEqual([0.5, 0.25]);
        expect(again?.path).toBe(first?.path ?? "");
      },
    );
  });

  test("rejects an unknown target slug and an --at outside 0..1", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: morphScript,
            slides: { problem: problemHtml, architecture: morphedHtml },
          },
        ],
      },
      async (root) => {
        const runner = async () => ({ overflows: [], contrasts: [] });
        const deckDir = join(root, "decks", "demo");
        await expect(
          shotMorph(deckDir, { from: "problem", to: "nope", at: 0.5, playerScript: "", runner }),
        ).rejects.toMatchObject({ name: "DekError", message: 'section "nope" not found' });
        await expect(
          shotMorph(deckDir, {
            from: "problem",
            to: "architecture",
            at: 1.5,
            playerScript: "",
            runner,
          }),
        ).rejects.toMatchObject({ name: "DekError", message: expect.stringContaining("--at") });
      },
    );
  });
});
