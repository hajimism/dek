import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type BuildOptions, buildDeck } from "../../src/core/build.ts";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { playerEmbed } from "../helpers/embed.ts";
import { slideDocument } from "../helpers/html.ts";
import { assetFixturesDir } from "../helpers/paths.ts";
import { withTempProject } from "../helpers/project.ts";

const introSource = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/pixel.png" alt="">
</section>`);

const extraSource = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">extra</h2>
</section>`);

async function build(dir: string, options: Omit<BuildOptions, "playerScript"> = {}) {
  const { playerScript } = await playerEmbed();
  return buildDeck(dir, { playerScript, ...options });
}

/** Stands in for Chromium: writes a fake PNG where each screenshot goes, and counts the calls. */
function fakeRunner() {
  const requests: VisualRequest[] = [];
  const runner = async (request: VisualRequest) => {
    requests.push(request);
    for (const page of request.pages) {
      if (page.screenshotPath) {
        await Bun.write(page.screenshotPath, `png of ${page.slug}`);
      }
    }
    return { overflows: [], contrasts: [] };
  };
  return { runner, requests };
}

const previewScript = `---
title: Why dek
description: Slides as a build.
---

## intro

### one

first

### two

second

## extra

more
`;

describe("buildDeck", () => {
  test("inlines the deck-root asset when slides/ holds one with the same path", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: ".slide { width: 1280px; }\n",
            script: `---
title: Demo
---

## intro

hello
`,
            slides: { intro: introSource },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
        await mkdir(join(deckDir, "slides", "assets"), { recursive: true });
        await writeFile(join(deckDir, "slides", "assets", "pixel.png"), "not a png");
        const { outPath } = await build(deckDir);
        const html = await readFile(outPath, "utf8");
        expect(html).toContain("data:image/png;base64,iVBOR");
        expect(html).not.toContain(Buffer.from("not a png").toString("base64"));
      },
    );
  });

  test("writes a single inlined HTML file without touching source slides", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: ".slide { width: 1280px; background: #c0ffee; }\n",
            script: `---
title: Demo
---

## intro

hello

## extra {#extra}

more
`,
            slides: { intro: introSource, extra: extraSource },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));

        const result = await build(deckDir);
        expect(result.outPath).toBe(join(root, "decks", "demo", "dist", "demo.html"));
        expect(existsSync(result.outPath)).toBe(true);

        const html = await readFile(result.outPath, "utf8");
        expect(html).toContain('data-slug="intro"');
        expect(html).toContain('data-slug="extra"');
        expect(html.indexOf('data-slug="intro"')).toBeLessThan(html.indexOf('data-slug="extra"'));
        expect(html).toContain("#c0ffee");
        expect(html).toContain("data:image/png;base64,");
        expect(html).toContain("is-shown");
        expect(html).toContain("startViewTransition");
        expect(html).toContain("BroadcastChannel");
        expect(html.toLowerCase()).toContain("presenter");
        expect(html).toContain("</h2>\n  <img");
        expect(html).not.toContain("EventSource");
        expect(html).toContain("ArrowLeft");

        expect(await readFile(join(deckDir, "slides", "intro.html"), "utf8")).toBe(introSource);
      },
    );
  });

  test("inlines theme.css url() assets as data URIs", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `.slide { background: url(assets/pixel.png); }\n`,
            slides: { intro: extraSource },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
        const html = await readFile((await build(deckDir)).outPath, "utf8");
        expect(html).toContain("data:image/png;base64,");
        expect(html).not.toContain("url(assets/");
      },
    );
  });

  test("does not inline theme.css urls that escape the deck directory", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `.slide { background: url(../../assets/pixel.png); }\n`,
            slides: { intro: extraSource },
          },
        ],
      },
      async (root) => {
        await copyFile(join(assetFixturesDir, "pixel.png"), join(root, "assets", "pixel.png"));
        const html = await readFile((await build(join(root, "decks", "demo"))).outPath, "utf8");
        expect(html).toContain("url(../../assets/pixel.png)");
        expect(html).not.toContain("data:image/png;base64,");
      },
    );
  });

  test("does not inline assets that escape the deck directory", async () => {
    const escaped = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="../../assets/pixel.png" alt="">
</section>`);
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: escaped } }],
      },
      async (root) => {
        await copyFile(join(assetFixturesDir, "pixel.png"), join(root, "assets", "pixel.png"));
        const html = await readFile((await build(join(root, "decks", "demo"))).outPath, "utf8");
        expect(html).toContain('src="../../assets/pixel.png"');
        expect(html).not.toContain("data:image/png;base64,");
      },
    );
  });

  test("does not embed diagnostics overlay in the built file", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello

## extra

more
`,
            slides: { intro: extraSource, extra: extraSource },
          },
        ],
      },
      async (root) => {
        const html = await readFile((await build(join(root, "decks", "demo"))).outPath, "utf8");
        expect(html).not.toContain('class="dek-diagnostics"');
        expect(html).toContain('data-slug="intro"');
      },
    );
  });

  test("builds a section with no slide HTML from its skeleton", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello

## extra

more
`,
            slides: { intro: extraSource },
          },
        ],
      },
      async (root) => {
        // A deck that shows beats none: the section falls back to the skeleton sync would write,
        // and lint's DEK001 still tells the author the file is missing.
        const html = await readFile((await build(join(root, "decks", "demo"))).outPath, "utf8");
        expect(html).toContain('data-slug="extra"');
        expect(html).not.toContain("data-missing");
      },
    );
  });
});

describe("buildDeck link preview", () => {
  const spec = (toml?: string) => ({
    ...(toml ? { toml } : {}),
    decks: [
      {
        name: "demo",
        script: previewScript,
        slides: { intro: introSource, extra: extraSource },
      },
    ],
  });

  test("writes the first slide as dist/<deck>.png and points og:image at it", async () => {
    await withTempProject(spec('url = "https://example.com/talks"\n'), async (root) => {
      const deckDir = join(root, "decks", "demo");
      await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
      const { runner, requests } = fakeRunner();
      const result = await build(deckDir, { runner });

      expect(result.image).toBe(join(deckDir, "dist", "demo.png"));
      expect(await readFile(join(deckDir, "dist", "demo.png"), "utf8")).toBe("png of intro");
      expect(requests).toHaveLength(1);
      expect(requests[0]?.actions).toEqual(["screenshot"]);
      expect(requests[0]?.viewport).toEqual({ width: 1280, height: 720 });
      expect(requests[0]?.pages.map((page) => [page.slug, page.step])).toEqual([["intro", "two"]]);

      const html = await readFile(result.outPath, "utf8");
      expect(html).toContain('<meta property="og:title" content="Why dek">');
      expect(html).toContain('<meta property="og:description" content="Slides as a build.">');
      expect(html).toContain(
        '<meta property="og:url" content="https://example.com/talks/demo.html">',
      );
      expect(html).toContain(
        '<meta property="og:image" content="https://example.com/talks/demo.png">',
      );
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
    });
  });

  test("takes the URL from the build over dek.toml", async () => {
    await withTempProject(spec('url = "https://example.com/talks/"\n'), async (root) => {
      const deckDir = join(root, "decks", "demo");
      await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
      const result = await build(deckDir, {
        url: "https://preview-123.example.dev/",
        runner: fakeRunner().runner,
      });
      const html = await readFile(result.outPath, "utf8");
      expect(html).toContain('content="https://preview-123.example.dev/demo.png"');
    });
  });

  test("reuses the cached shot while the first slide is unchanged", async () => {
    await withTempProject(spec('url = "https://example.com/"\n'), async (root) => {
      const deckDir = join(root, "decks", "demo");
      await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
      const { runner, requests } = fakeRunner();
      await build(deckDir, { runner });
      await build(deckDir, { runner });
      expect(requests).toHaveLength(1);

      await writeFile(join(deckDir, "slides", "intro.html"), extraSource);
      await build(deckDir, { runner });
      expect(requests).toHaveLength(2);
    });
  });

  test("without a URL, writes the text tags and no image", async () => {
    await withTempProject(spec(), async (root) => {
      const deckDir = join(root, "decks", "demo");
      await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
      const { runner, requests } = fakeRunner();
      const result = await build(deckDir, { runner });

      expect(requests).toHaveLength(0);
      expect(result.image).toBeUndefined();
      expect(result.imageSkipped).toBe("no-url");
      expect(existsSync(join(deckDir, "dist", "demo.png"))).toBe(false);
      const html = await readFile(result.outPath, "utf8");
      expect(html).toContain('<meta property="og:title" content="Why dek">');
      expect(html).not.toContain("og:image");
      expect(html).not.toContain("og:url");
    });
  });

  test("without Playwright, builds the page and says why there is no image", async () => {
    await withTempProject(spec('url = "https://example.com/"\n'), async (root) => {
      const deckDir = join(root, "decks", "demo");
      await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
      const result = await build(deckDir, { runner: async () => null });

      expect(result.image).toBeUndefined();
      expect(result.imageSkipped).toBe("no-playwright");
      const html = await readFile(result.outPath, "utf8");
      expect(html).toContain('<meta property="og:url" content="https://example.com/demo.html">');
      expect(html).not.toContain("og:image");
    });
  });

  test("drops a preview image left from an earlier build that can no longer take one", async () => {
    await withTempProject(spec('url = "https://example.com/"\n'), async (root) => {
      const deckDir = join(root, "decks", "demo");
      await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
      await build(deckDir, { runner: fakeRunner().runner });
      expect(existsSync(join(deckDir, "dist", "demo.png"))).toBe(true);
      await writeFile(join(root, "dek.toml"), "# no url\n");
      await build(deckDir, { runner: fakeRunner().runner });
      expect(existsSync(join(deckDir, "dist", "demo.png"))).toBe(false);
    });
  });
});
