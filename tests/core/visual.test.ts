import { describe, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PagesResponse, VisualRequest } from "../../src/core/playwright.ts";
import { shotDeck } from "../../src/core/shot/still.ts";
import { lintVisualDeck, runVisualDeck } from "../../src/core/visual.ts";
import { slideDocument } from "../helpers/html.ts";
import { assetFixturesDir } from "../helpers/paths.ts";
import { withTempProject } from "../helpers/project.ts";
import { pagesOf, writeRequested } from "../helpers/visual.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

describe("runVisualDeck screenshot", () => {
  test("names the screenshot exactly like shotDeck for the same slide", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const runner = async (request: VisualRequest) => {
          await writeRequested(request);
          return { overflows: [], contrasts: [] };
        };
        const visual = await runVisualDeck(deckDir, { slug: "intro", screenshot: true, runner });
        const shots = await shotDeck(deckDir, { slug: "intro", runner });
        expect(visual?.screenshotPath).toMatch(/\/intro~0\.[0-9a-f]{8}\.png$/);
        expect(visual?.screenshotPath).toBe(shots[0]?.path);
      },
    );
  });

  test("refuses a shots folder that links out of the project, and writes nothing there", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const outside = await mkdtemp(join(tmpdir(), "dek-outside-"));
        try {
          await mkdir(join(deckDir, ".cache"), { recursive: true });
          await symlink(outside, join(deckDir, ".cache", "shots"));
          const runner = async (request: VisualRequest) => {
            await writeRequested(request);
            return { overflows: [], contrasts: [] };
          };
          await expect(
            runVisualDeck(deckDir, { slug: "intro", screenshot: true, runner }),
          ).rejects.toThrow("leads outside the project");
          expect(await readdir(outside)).toEqual([]);
        } finally {
          await rm(outside, { recursive: true, force: true });
        }
      },
    );
  });
});

describe("lintVisualDeck", () => {
  /** A text sample as the worker reports it; each test sets what it is about. */
  const sample = {
    slug: "intro",
    step: "1",
    box: "p",
    fg: "rgb(119, 119, 119)",
    bg: "rgb(255, 255, 255)",
    fontWeight: 400,
  };

  test("emits DEK030 when the runner reports overflow", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const diagnostics = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [{ slug: "intro", step: "1", box: "h2", by: { bottom: 8 } }],
            contrasts: [],
          }),
        });
        expect(diagnostics?.some((d) => d.id === "DEK030")).toBe(true);
        const dek030 = diagnostics?.find((d) => d.id === "DEK030");
        expect(dek030?.path).toContain("slides/intro.html");
        expect(dek030?.message).toContain("1");
      },
    );
  });

  test("emits DEK031 when the runner reports low contrast", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const diagnostics = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [],
            contrasts: [{ ...sample, ratio: 2.1, fontSize: 16 }],
          }),
        });
        expect(diagnostics?.some((d) => d.id === "DEK031")).toBe(true);
        const dek031 = diagnostics?.find((d) => d.id === "DEK031");
        expect(dek031?.path).toContain("slides/intro.html");
        expect(dek031?.message).toContain("2.1");
        expect(dek031?.data).toEqual({
          box: "p",
          ratio: 2.1,
          threshold: 4.5,
          fg: "#777777",
          bg: "#ffffff",
          steps: ["1"],
        });
      },
    );
  });

  test("sends a DEK031 the theme alone causes to theme.css", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const diagnostics = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [],
            contrasts: [{ ...sample, ratio: 2.1, fontSize: 16, origin: "theme" }],
          }),
        });
        const dek031 = diagnostics?.find((d) => d.id === "DEK031");
        expect(dek031?.hint).toBe(
          "theme.css alone draws it below 4.5:1: fix the pair in theme.css, where one change reaches every slide that uses it",
        );
        expect(dek031?.data).toMatchObject({ origin: "theme" });
      },
    );
  });

  test("keeps a DEK031 the slide's own stylesheet causes on that slide", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const diagnostics = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [],
            contrasts: [{ ...sample, ratio: 2.1, fontSize: 16, origin: "slide" }],
          }),
        });
        const dek031 = diagnostics?.find((d) => d.id === "DEK031");
        expect(dek031?.hint).toBe(
          "slides/intro.css brings it below 4.5:1, which theme.css alone does not: raise its contrast in slides/intro.css",
        );
        expect(dek031?.data).toMatchObject({ origin: "slide" });
      },
    );
  });

  test("accepts 3:1 for large text and says so when it still fails", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const passing = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [],
            contrasts: [{ ...sample, ratio: 3.2, fontSize: 32 }],
          }),
        });
        expect(passing?.some((d) => d.id === "DEK031")).toBe(false);

        const failing = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [],
            contrasts: [{ ...sample, ratio: 2.8, fontSize: 32 }],
          }),
        });
        const dek031 = failing?.find((d) => d.id === "DEK031");
        expect(dek031?.message).toContain("2.8");
        expect(dek031?.message).toContain("3:1");
        expect(dek031?.message).toContain("large text");

        const small = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [],
            contrasts: [{ ...sample, ratio: 3.2, fontSize: 20 }],
          }),
        });
        expect(small?.find((d) => d.id === "DEK031")?.message).toContain("4.5:1");
      },
    );
  });

  test("returns null when the runner is missing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        expect(
          await lintVisualDeck(join(root, "decks", "demo"), { runner: async () => null }),
        ).toBe(null);
      },
    );
  });

  test("leaves a missing slide HTML to lint (DEK001) and still checks the other slides", async () => {
    const twoSections = "---\ntitle: Demo\n---\n\n## intro\n\nhello\n\n## missing\n\nbye\n";
    await withTempProject(
      { decks: [{ name: "demo", script: twoSections, slides: { intro: introHtml } }] },
      async (root) => {
        const seen: string[] = [];
        const diagnostics = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async (request: VisualRequest) => {
            seen.push(...pagesOf(request).map((page) => page.slug));
            return { overflows: [], contrasts: [] };
          },
        });
        expect(diagnostics).toEqual([]);
        expect(seen).toEqual(["intro"]);
      },
    );
  });

  test("a broken slide script is left to DEK016 and every beat is still checked", async () => {
    const twoBeats = `---
title: Demo
---

## intro

### one

first

### two

second
`;
    await withTempProject(
      { decks: [{ name: "demo", script: twoBeats, slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await Bun.write(
          join(deckDir, "slides", "intro.ts"),
          'import x from "x";\nexport default {};',
        );
        const steps: string[] = [];
        const diagnostics = await lintVisualDeck(deckDir, {
          runner: async (request: VisualRequest) => {
            steps.push(...pagesOf(request).map((page) => page.step));
            return { overflows: [], contrasts: [] };
          },
        });
        expect(diagnostics).toEqual([]);
        expect(steps).toEqual(["0", "one", "two"]);
      },
    );
  });

  test("passes inlined asset HTML to the runner", async () => {
    const withImage = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/pixel.png" alt="">
</section>`);
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: withImage } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
        const seen: string[] = [];
        await lintVisualDeck(deckDir, {
          runner: async (request: VisualRequest) => {
            seen.push(pagesOf(request)[0]?.html ?? "");
            return { overflows: [], contrasts: [] };
          },
        });
        expect(seen[0]).toContain("data:image/png;base64,");
        expect(seen[0]).not.toContain('src="assets/pixel.png"');
      },
    );
  });

  test("sends every beat to the runner in one call", async () => {
    const twoBeatScript = `---
title: Demo
---

## intro

### one

first

### two

second
`;
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: twoBeatScript,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        let calls = 0;
        let pages = 0;
        await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async (request: VisualRequest) => {
            calls += 1;
            pages = pagesOf(request).length;
            return { overflows: [], contrasts: [] };
          },
        });
        expect(calls).toBe(1);
        expect(pages).toBe(3);
      },
    );
  });
});

describe("lintVisualDeck messages", () => {
  async function lintWith(response: PagesResponse) {
    const diagnostics = await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      (root) => lintVisualDeck(join(root, "decks", "demo"), { runner: async () => response }),
    );
    return diagnostics ?? [];
  }

  test("names the element, its text, and how far it overflows, once across steps", async () => {
    const overflow = {
      slug: "intro",
      box: 'li[data-step="vague"]',
      text: "https://example.com/very/long/url/that/never/wraps",
      by: { right: 412 },
    };
    const diagnostics = await lintWith({
      overflows: [
        { ...overflow, step: "slow" },
        { ...overflow, step: "vague" },
      ],
      contrasts: [],
    });
    expect(diagnostics.filter((d) => d.id === "DEK030")).toEqual([
      {
        id: "DEK030",
        severity: "error",
        message:
          'li[data-step="vague"] "https://example.com/very…" overflows the right edge by 412px at steps slow, vague',
        path: expect.stringContaining("slides/intro.html"),
        slug: "intro",
        hint: "shorten it, or let it wrap with overflow-wrap: anywhere in slides/intro.css",
        data: {
          box: 'li[data-step="vague"]',
          text: "https://example.com/very/long/url/that/never/wraps",
          edges: { right: 412 },
          steps: ["slow", "vague"],
        },
      },
    ]);
  });

  test("keeps the largest amount and names every edge", async () => {
    const diagnostics = await lintWith({
      overflows: [
        { slug: "intro", step: "1", box: "ul", by: { bottom: 120, right: 3 } },
        { slug: "intro", step: "2", box: "ul", by: { bottom: 180, right: 3 } },
      ],
      contrasts: [],
    });
    const dek030 = diagnostics.find((d) => d.id === "DEK030");
    expect(dek030?.message).toBe(
      "ul overflows the right edge by 3px and the bottom edge by 180px at steps 1, 2",
    );
    expect(dek030?.hint).toBe(
      "shorten it, or let it wrap with overflow-wrap: anywhere in slides/intro.css; cut it, split it across beats or slides, or give it a smaller size in slides/intro.css",
    );
  });

  test("says the content overflows the slide when no edge is named", async () => {
    const diagnostics = await lintWith({
      overflows: [
        { slug: "intro", step: "1", box: "section", by: {} },
        { slug: "intro", step: "1", box: "p", text: "late", by: {} },
      ],
      contrasts: [],
    });
    expect(
      diagnostics.filter((d) => d.id === "DEK030").map(({ message, hint }) => ({ message, hint })),
    ).toEqual([
      { message: "content overflows the slide at step 1", hint: undefined },
      { message: 'p "late" overflows the slide at step 1', hint: undefined },
    ]);
  });

  test("reports an element once per set of edges it crosses", async () => {
    const diagnostics = await lintWith({
      overflows: [
        { slug: "intro", step: "1", box: "ul", by: { bottom: 10 } },
        { slug: "intro", step: "2", box: "ul", by: { right: 4 } },
        { slug: "intro", step: "3", box: "ul", by: { bottom: 30 } },
      ],
      contrasts: [],
    });
    expect(diagnostics.filter((d) => d.id === "DEK030").map((d) => d.message)).toEqual([
      "ul overflows the bottom edge by 30px at steps 1, 3",
      "ul overflows the right edge by 4px at step 2",
    ]);
  });

  test("reports contrasts apart when their rounded ratio or origin differs", async () => {
    const sample = {
      slug: "intro",
      fontSize: 16,
      fontWeight: 400,
      box: "p",
      fg: "rgb(119, 119, 119)",
      bg: "rgb(255, 255, 255)",
    };
    const diagnostics = await lintWith({
      overflows: [],
      contrasts: [
        { ...sample, step: "1", ratio: 2.12 },
        { ...sample, step: "2", ratio: 2.14 },
        { ...sample, step: "3", ratio: 2.4 },
        { ...sample, step: "4", ratio: 2.12, origin: "theme" },
        { ...sample, step: "5", ratio: 4.6 },
      ],
    });
    expect(diagnostics.filter((d) => d.id === "DEK031").map((d) => d.message)).toEqual([
      "p has contrast 2.1 (#777777 on #ffffff), below 4.5:1 at steps 1, 2",
      "p has contrast 2.4 (#777777 on #ffffff), below 4.5:1 at step 3",
      "p has contrast 2.1 (#777777 on #ffffff), below 4.5:1 at step 4",
    ]);
  });

  test("names the element and both colors when contrast is low", async () => {
    const sample = {
      slug: "intro",
      ratio: 1.94,
      fontSize: 20,
      fontWeight: 400,
      box: "p.stat-label",
      text: "手戻りの減少",
      fg: "rgb(68, 68, 68)",
      bg: "rgb(17, 17, 17)",
    };
    const diagnostics = await lintWith({
      overflows: [],
      contrasts: [
        { ...sample, step: "1" },
        { ...sample, step: "2" },
      ],
    });
    expect(diagnostics.filter((d) => d.id === "DEK031")).toEqual([
      {
        id: "DEK031",
        severity: "error",
        message:
          'p.stat-label "手戻りの減少" has contrast 1.9 (#444444 on #111111), below 4.5:1 at steps 1, 2',
        path: expect.stringContaining("slides/intro.html"),
        slug: "intro",
        hint: "raise the contrast of its color against the background to 4.5:1",
        data: {
          box: "p.stat-label",
          text: "手戻りの減少",
          ratio: 1.9,
          threshold: 4.5,
          fg: "#444444",
          bg: "#111111",
          steps: ["1", "2"],
        },
      },
    ]);
  });
});
