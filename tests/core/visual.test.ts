import { describe, expect, test } from "bun:test";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import type { VisualRequest, VisualResponse } from "../../src/core/playwright.ts";
import { shotDeck } from "../../src/core/shot.ts";
import {
  contrastRatio,
  contrastThreshold,
  findOverflows,
  lintVisualDeck,
  parseCssRgb,
  runVisualDeck,
} from "../../src/core/visual.ts";
import { slideDocument } from "../helpers/html.ts";
import { assetFixturesDir } from "../helpers/paths.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

describe("parseCssRgb", () => {
  test("parses comma and space separated rgb()", () => {
    expect(parseCssRgb("rgb(245, 245, 245)")).toEqual([245, 245, 245]);
    expect(parseCssRgb("rgb(245 245 245)")).toEqual([245, 245, 245]);
    expect(parseCssRgb("rgba(17, 17, 17, 1)")).toEqual([17, 17, 17]);
  });

  test("skips oklch and other non-rgb colors", () => {
    expect(parseCssRgb("oklch(0.7 0.1 120)")).toBeUndefined();
  });
});

describe("contrastRatio", () => {
  test("is high for light text on a dark background", () => {
    expect(contrastRatio([245, 245, 245], [17, 17, 17])).toBeGreaterThan(4.5);
  });

  test("is below 4.5 for gray text on white", () => {
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeLessThan(4.5);
  });
});

describe("contrastThreshold", () => {
  test("uses 3:1 for WCAG large text and 4.5:1 otherwise", () => {
    expect(contrastThreshold({ fontSize: 24, fontWeight: 400 })).toBe(3);
    expect(contrastThreshold({ fontSize: 18.66, fontWeight: 700 })).toBe(3);
    expect(contrastThreshold({ fontSize: 18, fontWeight: 700 })).toBe(4.5);
    expect(contrastThreshold({ fontSize: 23.9, fontWeight: 400 })).toBe(4.5);
    expect(contrastThreshold({ fontSize: 24 })).toBe(3);
  });

  test("falls back to 4.5:1 when the runner did not report a size", () => {
    expect(contrastThreshold({})).toBe(4.5);
    expect(contrastThreshold({ fontWeight: 700 })).toBe(4.5);
  });
});

describe("runVisualDeck screenshot", () => {
  test("names the screenshot exactly like shotDeck for the same slide", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
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
        const visual = await runVisualDeck(deckDir, { slug: "intro", screenshot: true, runner });
        const shots = await shotDeck(deckDir, { slug: "intro", runner });
        expect(visual?.screenshotPath).toMatch(/\/intro\.[0-9a-f]{8}\.png$/);
        expect(visual?.screenshotPath).toBe(shots[0]?.path);
      },
    );
  });
});

describe("lintVisualDeck", () => {
  test("emits DEK030 when the runner reports overflow", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const diagnostics = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [{ slug: "intro", step: "1", box: "h2" }],
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
            contrasts: [{ slug: "intro", step: "1", ratio: 2.1 }],
          }),
        });
        expect(diagnostics?.some((d) => d.id === "DEK031")).toBe(true);
        const dek031 = diagnostics?.find((d) => d.id === "DEK031");
        expect(dek031?.path).toContain("slides/intro.html");
        expect(dek031?.message).toContain("2.1");
        expect(dek031?.data).toEqual({ ratio: 2.1, threshold: 4.5, steps: ["1"] });
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
            contrasts: [{ slug: "intro", step: "1", ratio: 3.2, fontSize: 32, fontWeight: 400 }],
          }),
        });
        expect(passing?.some((d) => d.id === "DEK031")).toBe(false);

        const failing = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [],
            contrasts: [{ slug: "intro", step: "1", ratio: 2.8, fontSize: 32, fontWeight: 400 }],
          }),
        });
        const dek031 = failing?.find((d) => d.id === "DEK031");
        expect(dek031?.message).toContain("2.8");
        expect(dek031?.message).toContain("3:1");
        expect(dek031?.message).toContain("large text");

        const small = await lintVisualDeck(join(root, "decks", "demo"), {
          runner: async () => ({
            overflows: [],
            contrasts: [{ slug: "intro", step: "1", ratio: 3.2, fontSize: 20, fontWeight: 400 }],
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

  test("reports a diagnostic when slide HTML is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const diagnostics = await lintVisualDeck(join(root, "decks", "demo"), {
        runner: async () => ({ overflows: [], contrasts: [] }),
      });
      expect(diagnostics?.some((d) => d.message.includes("missing slide HTML"))).toBe(true);
      expect(diagnostics?.some((d) => d.path?.includes("intro.html"))).toBe(true);
    });
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
        const steps: Array<string | undefined> = [];
        const diagnostics = await lintVisualDeck(deckDir, {
          runner: async (request: VisualRequest) => {
            steps.push(...request.pages.map((page) => page.step));
            return { overflows: [], contrasts: [] };
          },
        });
        expect(diagnostics).toEqual([]);
        expect(steps).toEqual(["one", "two"]);
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
            seen.push(request.pages[0]?.html ?? "");
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
            pages = request.pages.length;
            return { overflows: [], contrasts: [] };
          },
        });
        expect(calls).toBe(1);
        expect(pages).toBe(2);
      },
    );
  });
});

describe("findOverflows", () => {
  const slideBox = { left: 0, top: 0, right: 1280, bottom: 720 };
  const el = (box: string, rect: [number, number, number, number], parent = -1, text?: string) => ({
    box,
    parent,
    rect: { left: rect[0], top: rect[1], right: rect[2], bottom: rect[3] },
    ...(text ? { text } : {}),
  });

  test("reports the outermost element that overflows an edge, not every child", () => {
    const found = findOverflows(slideBox, [
      el("ul", [80, 150, 1200, 900], -1, "時間がかかる"),
      el("li", [110, 150, 1200, 190], 0, "時間がかかる"),
      el("li", [110, 860, 1200, 900], 0, "さらに追加"),
    ]);
    expect(found).toEqual([{ box: "ul", text: "時間がかかる", by: { bottom: 180 } }]);
  });

  test("reports a child only for the edges its parent stays inside", () => {
    const found = findOverflows(slideBox, [
      el("ul", [80, 150, 1200, 900]),
      el("li", [110, 860, 1692, 900], 0, "https://example.com"),
    ]);
    expect(found).toEqual([
      { box: "ul", by: { bottom: 180 } },
      { box: "li", text: "https://example.com", by: { right: 412 } },
    ]);
  });

  test("ignores empty boxes and sub-pixel rounding", () => {
    expect(
      findOverflows(slideBox, [el("span", [2000, 0, 2000, 0]), el("p", [80, 64, 1280.4, 719])]),
    ).toEqual([]);
  });
});

describe("lintVisualDeck messages", () => {
  async function lintWith(response: VisualResponse) {
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
