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

  test("emits DEK032 once per error when a slide's draw throws, naming every beat", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const diagnostics = await lintVisualDeck(deckDir, {
          runner: async () => ({
            overflows: [],
            contrasts: [],
            drawErrors: [
              { slug: "intro", step: "1", t: 0, kind: "throw", message: "TypeError: x is null" },
              { slug: "intro", step: "2", t: 300, kind: "throw", message: "TypeError: x is null" },
            ],
          }),
        });
        expect(diagnostics?.filter((d) => d.id === "DEK032")).toEqual([
          {
            id: "DEK032",
            severity: "error",
            message: "draw threw TypeError: x is null at the end of steps 1, 2",
            path: join(deckDir, "slides", "intro.ts"),
            slug: "intro",
            hint: "make draw in slides/intro.ts draw the end of every beat without throwing; until then every still, shot, and PDF shows the slide as if draw never ran",
            data: { kind: "throw", message: "TypeError: x is null", steps: ["1", "2"] },
          },
        ]);
      },
    );
  });

  test("emits DEK032 for a draw that reaches outside its slide or keeps state", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const at = { slug: "intro", step: "1", t: 400 };
        const diagnostics = await lintVisualDeck(deckDir, {
          runner: async () => ({
            overflows: [],
            contrasts: [],
            drawErrors: [
              { ...at, kind: "reach", message: "changes <body> outside its slide" },
              {
                ...at,
                kind: "seek",
                message: "draws the end of the beat differently after drawing its start",
              },
            ],
          }),
        });
        expect(
          diagnostics
            ?.filter((d) => d.id === "DEK032")
            .map(({ message, hint }) => ({ message, hint })),
        ).toEqual([
          {
            message: "draw changes <body> outside its slide at the end of step 1",
            hint: "find elements from the slide draw is given in slides/intro.ts, and change nothing else: the built deck holds every slide",
          },
          {
            message: "draw draws the end of the beat differently after drawing its start at step 1",
            hint: "draw from t alone in slides/intro.ts: work every value out from t and set everything you touch on every call, with nothing kept between calls",
          },
        ]);
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
        expect(dek031?.path).toBe(join(root, "decks", "demo", "theme.css"));
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
        expect(dek031?.path).toBe(join(root, "decks", "demo", "slides", "intro.css"));
      },
    );
  });

  test("sends a DEK031 a slide script's draw causes to the script", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const diagnostics = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [],
            contrasts: [{ ...sample, ratio: 2.1, fontSize: 16, origin: "script" }],
          }),
        });
        const dek031 = diagnostics?.find((d) => d.id === "DEK031");
        expect(dek031?.hint).toBe(
          "slides/intro.ts draws it below 4.5:1, and a color draw sets inline wins over any stylesheet: raise the contrast of the color it sets in slides/intro.ts",
        );
        expect(dek031?.path).toBe(join(root, "decks", "demo", "slides", "intro.ts"));
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

        // The same pages answer differently here, which only a fresh measure can hear.
        const fresh = () =>
          rm(join(root, "decks", "demo", ".cache"), { recursive: true, force: true });
        await fresh();
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

        await fresh();
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
      'shorten it, or let it wrap with overflow-wrap: anywhere in slides/intro.css; cut it, split it across beats or slides, or give it a smaller size in slides/intro.css; if it is decoration meant to bleed off the slide, mark it aria-hidden="true"',
    );
  });

  // The fix is where the cause is: a script that moves the element, a stylesheet that places it,
  // or, when neither does, content too big for the slide.
  test("sends an overflow to the file that caused it", async () => {
    const at = { slug: "intro", step: "1", text: "moved", by: { right: 120 } };
    const diagnostics = await lintWith({
      overflows: [
        { ...at, box: "p.a", origin: "script" },
        { ...at, box: "p.b", origin: "slide" },
        { ...at, box: "p.c", origin: "content" },
      ],
      contrasts: [],
    });
    expect(
      diagnostics
        .filter((d) => d.id === "DEK030")
        .map(({ path, hint, data }) => ({
          path: path?.split("/").slice(-2).join("/"),
          hint,
          origin: data?.origin,
        })),
    ).toEqual([
      {
        path: "slides/intro.ts",
        hint: "draw in slides/intro.ts moves or sizes it past the edge: keep what it draws inside the slide at every beat",
        origin: "script",
      },
      {
        path: "slides/intro.css",
        hint: "slides/intro.css puts it past the edge, which the theme alone does not: fix its position or size in slides/intro.css",
        origin: "slide",
      },
      {
        path: "slides/intro.html",
        hint: "shorten it, or let it wrap with overflow-wrap: anywhere in slides/intro.css",
        origin: "content",
      },
    ]);
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

// A page renders the same as long as its HTML, which holds its theme, CSS, script, and assets,
// is the same: its findings are kept, and only what changed is measured again.
describe("lintVisualDeck cache", () => {
  const script = "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### one\n\n### two\n";
  const plan = slideDocument(
    `<section class="slide"><ul><li data-step="one">a</li><li data-step="two">b</li></ul></section>`,
  );

  /** A runner that finds one overflow on every page, and counts the pages it was sent. */
  function countingRunner() {
    const asked: string[] = [];
    const runner = async (request: VisualRequest) => {
      const pages = pagesOf(request);
      asked.push(...pages.map((page) => `${page.slug}@${page.step}`));
      await writeRequested(request, "png");
      return {
        overflows: pages.map((page) => ({
          slug: page.slug,
          step: page.step,
          box: "h2",
          by: { bottom: 3 },
        })),
        contrasts: [],
        drawErrors: [],
      } satisfies PagesResponse;
    };
    return { asked, runner };
  }

  test("measures each page once, and again only when what it renders changes", async () => {
    await withTempProject(
      { decks: [{ name: "demo", script, slides: { intro: introHtml, plan } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const first = countingRunner();
        const found = await lintVisualDeck(deckDir, { runner: first.runner });
        expect(first.asked).toEqual(["intro@0", "plan@0", "plan@one", "plan@two"]);

        const second = countingRunner();
        expect(await lintVisualDeck(deckDir, { runner: second.runner })).toEqual(found);
        expect(second.asked).toEqual([]);

        await Bun.write(join(deckDir, "slides", "plan.css"), ".slide li { font-weight: 700; }\n");
        const third = countingRunner();
        await lintVisualDeck(deckDir, { runner: third.runner });
        expect(third.asked).toEqual(["plan@0", "plan@one", "plan@two"]);
      },
    );
  });

  test("still shoots a page whose findings it has, when the shot is not on disk", async () => {
    await withTempProject(
      { decks: [{ name: "demo", script, slides: { intro: introHtml, plan } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await lintVisualDeck(deckDir, { runner: countingRunner().runner });
        const shot = countingRunner();
        const result = await runVisualDeck(deckDir, {
          slug: "plan",
          screenshot: true,
          runner: shot.runner,
        });
        expect(shot.asked).toEqual(["plan@two"]);
        expect(result?.diagnostics.map((d) => d.id)).toEqual(["DEK030"]);
      },
    );
  });
});

// A draw that finds another slide's element through the document looks right on its own page;
// only a page that holds every slide, as the built deck does, shows it. One is measured for its
// draws whenever a slide has a script.
describe("lintVisualDeck and the whole deck", () => {
  const script = "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n";
  const plan = slideDocument(`<section class="slide"><p data-bar>plan</p></section>`);

  test("draws every slide on one page, and reports what its draws do there", async () => {
    await withTempProject(
      { decks: [{ name: "demo", script, slides: { intro: introHtml, plan } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await Bun.write(join(deckDir, "slides", "plan.ts"), "export default { draw() {} };\n");
        const wholeDeck: string[] = [];
        const diagnostics = await lintVisualDeck(deckDir, {
          runner: async (request) => {
            const pages = pagesOf(request);
            const deckPage = pages.find(
              (page) => (page.html.match(/data-slug="/g) ?? []).length > 1,
            );
            if (!deckPage) {
              return { overflows: [], contrasts: [], drawErrors: [] };
            }
            wholeDeck.push(deckPage.html);
            return {
              overflows: [],
              contrasts: [],
              drawErrors: [
                {
                  slug: "plan",
                  step: "0",
                  t: 0,
                  kind: "reach",
                  message: `changes the "intro" slide's <h2> outside its slide`,
                },
              ],
            };
          },
        });
        expect(wholeDeck).toHaveLength(1);
        expect(diagnostics?.find((d) => d.id === "DEK032")?.message).toBe(
          `draw changes the "intro" slide's <h2> outside its slide at the end of step 0`,
        );
      },
    );
  });

  test("draws no such page for a deck without slide scripts", async () => {
    await withTempProject(
      { decks: [{ name: "demo", script, slides: { intro: introHtml, plan } }] },
      async (root) => {
        const counts: number[] = [];
        await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async (request) => {
            counts.push(
              ...pagesOf(request).map((page) => (page.html.match(/data-slug="/g) ?? []).length),
            );
            return { overflows: [], contrasts: [], drawErrors: [] };
          },
        });
        expect(counts.every((count) => count === 1)).toBe(true);
      },
    );
  });
});
