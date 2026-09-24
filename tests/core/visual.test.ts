import { describe, expect, test } from "bun:test";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { shotDeck } from "../../src/core/shot.ts";
import {
  contrastRatio,
  contrastThreshold,
  lintVisualDeck,
  overflowsSlide,
  parseCssRgb,
  runVisualDeck,
} from "../../src/core/visual.ts";
import { slideDocument } from "../helpers/html.ts";
import { assetFixturesDir } from "../helpers/paths.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

describe("overflowsSlide", () => {
  const slide = { left: 0, top: 0, right: 1280, bottom: 720 };

  test("is false when the child is inside the slide", () => {
    expect(overflowsSlide(slide, { left: 80, top: 64, right: 400, bottom: 200 })).toBe(false);
  });

  test("is true when the child extends past the slide", () => {
    expect(overflowsSlide(slide, { left: 0, top: 0, right: 1280, bottom: 800 })).toBe(true);
  });
});

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
