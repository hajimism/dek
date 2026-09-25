import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { type BuildOptions, buildDeck } from "../../src/core/build.ts";
import { DekError } from "../../src/core/error.ts";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { playerEmbed } from "../helpers/embed.ts";
import { withTempDir } from "../helpers/fs.ts";
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

/**
 * A build of a repository someone else wrote, as in CI on a pull request: whatever its links
 * point at, the published files hold only what the deck holds, and nothing outside is touched.
 */
describe("buildDeck on a repository with hostile links", () => {
  const spec = (toml?: string) => ({
    ...(toml ? { toml } : {}),
    decks: [{ name: "demo", slides: { intro: extraSource } }],
  });

  /** A project, and beside it a secret that no link out of the project may reach. */
  async function withSecret(
    toml: string | undefined,
    fn: (root: string, secret: string) => Promise<void>,
  ): Promise<void> {
    await withTempDir(async (outside) => {
      const secret = join(outside, "secret.css");
      await writeFile(secret, "SECRET_TOKEN=ghp_1234");
      await withTempProject(spec(toml), (root) => fn(root, secret));
    });
  }

  test.each(["theme.css", "slides/intro.css", "slides/intro.ts", "slides/intro.html", "script.md"])(
    "refuses a %s that links out of the project",
    async (file) => {
      await withSecret(undefined, async (root, secret) => {
        const deckDir = join(root, "decks", "demo");
        await rm(join(deckDir, file), { force: true });
        await symlink(secret, join(deckDir, file));
        const error = await build(deckDir).catch((caught: unknown) => caught);
        expect(error).toBeInstanceOf(DekError);
        expect(existsSync(join(deckDir, "dist", "demo.html"))).toBe(false);
      });
    },
  );

  test("refuses a theme.css that links into a hidden folder of the project", async () => {
    await withSecret(undefined, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(root, ".git"));
      await writeFile(join(root, ".git", "config.css"), "extraheader = AUTHORIZATION: basic x");
      await rm(join(deckDir, "theme.css"));
      await symlink("../../.git/config.css", join(deckDir, "theme.css"));
      await expect(build(deckDir)).rejects.toThrow("leads outside the project");
    });
  });

  test("still follows a theme.css linked to the project's own", async () => {
    await withSecret(undefined, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await writeFile(join(root, "theme.css"), ".shared-theme { color: red; }");
      await rm(join(deckDir, "theme.css"));
      await symlink("../../theme.css", join(deckDir, "theme.css"));
      const html = await readFile((await build(deckDir)).outPath, "utf8");
      expect(html).toContain(".shared-theme");
    });
  });

  test("takes a new shot over a cached one that is a link, and publishes only the shot", async () => {
    await withSecret('url = "https://example.com/"\n', async (root, secret) => {
      const deckDir = join(root, "decks", "demo");
      const { runner, requests } = fakeRunner();
      await build(deckDir, { runner });
      const shots = join(deckDir, ".cache", "shots");
      const [cached] = await readdir(shots);
      await rm(join(shots, cached as string));
      await symlink(secret, join(shots, cached as string));

      await build(deckDir, { runner });
      expect(requests).toHaveLength(2);
      expect(await readFile(join(deckDir, "dist", "demo.png"), "utf8")).toBe("png of intro");
      expect(await readFile(secret, "utf8")).toBe("SECRET_TOKEN=ghp_1234");
    });
  });

  test("refuses a shot cache that links out of the project", async () => {
    await withSecret('url = "https://example.com/"\n', async (root, secret) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, ".cache"), { recursive: true });
      await symlink(dirname(secret), join(deckDir, ".cache", "shots"));
      await expect(build(deckDir, { runner: fakeRunner().runner })).rejects.toThrow(DekError);
    });
  });

  test("refuses a dist file that is a link out, leaving its target alone", async () => {
    await withSecret(undefined, async (root, secret) => {
      const deckDir = join(root, "decks", "demo");
      await mkdir(join(deckDir, "dist"));
      const victim = join(dirname(secret), "victim.html");
      await writeFile(victim, "mine");
      await symlink(victim, join(deckDir, "dist", "demo.html"));
      await expect(build(deckDir)).rejects.toThrow("leads outside the project");
      expect(await readFile(victim, "utf8")).toBe("mine");
    });
  });

  test("refuses a dist folder that links out of the project", async () => {
    await withSecret(undefined, async (root, secret) => {
      const deckDir = join(root, "decks", "demo");
      await symlink(dirname(secret), join(deckDir, "dist"));
      await expect(build(deckDir)).rejects.toThrow("leads outside the project");
      expect(existsSync(join(dirname(secret), "demo.html"))).toBe(false);
    });
  });
});

test("keeps og:url on the served origin whatever the deck is called", async () => {
  await withTempProject(
    {
      toml: 'url = "https://example.com/talks/"\n',
      decks: [{ name: "javascript:alert(1)", slides: { intro: extraSource } }],
    },
    async (root) => {
      const deckDir = join(root, "decks", "javascript:alert(1)");
      const html = await readFile((await build(deckDir)).outPath, "utf8");
      expect(html).toContain(
        '<meta property="og:url" content="https://example.com/talks/javascript%3Aalert(1).html">',
      );
    },
  );
});
