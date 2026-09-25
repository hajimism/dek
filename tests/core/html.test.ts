import { describe, expect, test } from "bun:test";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../../src/core/config.ts";
import { renderDeckDocument, renderDeckHtml, renderRailHtml } from "../../src/core/document.ts";
import {
  applyShownClasses,
  extractSlideSection,
  htmlShell,
  injectSlug,
  loadSlideSources,
  renderIndexHtml,
  renderSlideHtml,
} from "../../src/core/html.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { stepValuesForBeat } from "../../src/core/step.ts";
import { playerEmbed } from "../helpers/embed.ts";
import { slideDocument } from "../helpers/html.ts";
import { assetFixturesDir } from "../helpers/paths.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const architectureHtml = slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">architecture</h2>
  <ul>
    <li data-step="hook">script.md が親</li>
  </ul>
</section>`);

async function renderPage(
  dir: string,
  options: { mode?: "player" | "presenter" | "video"; live?: boolean } = {},
) {
  const embed = await playerEmbed();
  return renderDeckHtml(dir, {
    playerScript: embed.playerScript,
    ...(options.live ? { liveReloadScript: embed.liveReloadScript, live: true } : {}),
    ...options,
  });
}

describe("extractSlideSection", () => {
  const fragment = `<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`;

  test("returns a file that is only a slide section", () => {
    expect(extractSlideSection(fragment)).toBe(fragment);
  });

  test("returns the same section from a full document", () => {
    expect(extractSlideSection(slideDocument(fragment))).toBe(fragment);
  });

  test("accepts an unquoted class attribute", () => {
    const html = `<body><section class=slide data-layout="title"><h2>intro</h2></section></body>`;
    expect(extractSlideSection(html)).toContain("intro");
  });

  test("keeps nested section tags inside the slide", () => {
    const html = `<section class="slide"><div><section class="note">inner</section></div><p>after</p></section>`;
    const extracted = extractSlideSection(html);
    expect(extracted).toContain("inner");
    expect(extracted).toContain("after");
    expect(extracted?.endsWith("</section>")).toBe(true);
  });

  test("reads until </body> when the slide omits </section>", () => {
    const html = `<body>
<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</body>`;
    const extracted = extractSlideSection(html);
    expect(extracted).toContain("intro");
    expect(extracted).not.toContain("</body>");
  });

  test("ignores a section whose only slide token is data-slide", () => {
    const html = `<body>
<section data-slide="note"><p>notes</p></section>
<section class="slide"><h2>intro</h2></section>
</body>`;
    expect(extractSlideSection(html)).toContain("intro");
    expect(extractSlideSection(html)).not.toContain("notes");
  });
});

describe("injectSlug", () => {
  test("does not overwrite an existing data-slug", () => {
    const html = `<section class="slide" data-slug="kept"><h2>intro</h2></section>`;
    expect(injectSlug(html, "intro")).toContain('data-slug="kept"');
    expect(injectSlug(html, "intro")).not.toContain('data-slug="intro"');
  });

  test("adds data-slug to an unquoted slide section", () => {
    const html = `<section class=slide data-layout="title"><h2>intro</h2></section>`;
    expect(injectSlug(html, "intro")).toContain('data-slug="intro"');
  });
});

describe("applyShownClasses", () => {
  test("marks the current slide and shown data-step values", () => {
    const html = `<section class="slide"><li data-step="hook">a</li><li data-step="2">b</li></section>`;
    const shown = stepValuesForBeat([{ id: "hook" }, {}], 0);
    const next = applyShownClasses(html, shown);
    expect(next).toContain("is-current");
    expect(next).toMatch(/data-step="hook"[^>]*is-shown|is-shown[^>]*data-step="hook"/);
    expect(next).not.toMatch(/data-step="2"[^>]*is-shown|is-shown[^>]*data-step="2"/);
  });

  test("keeps existing classes on quoted and unquoted tags", () => {
    const quoted = applyShownClasses(
      `<section class="slide title"><p class="node" data-step="hook">a</p></section>`,
      new Set(["hook"]),
    );
    expect(quoted).toMatch(/class="[^"]*slide[^"]*is-current|class="[^"]*is-current[^"]*slide/);
    expect(quoted).toMatch(/class="[^"]*node[^"]*is-shown|class="[^"]*is-shown[^"]*node/);

    const unquoted = applyShownClasses(
      `<section class=slide><p class=node data-step="hook">a</p></section>`,
      new Set(["hook"]),
    );
    expect(unquoted).toContain("is-current");
    expect(unquoted).toContain("is-shown");
    expect(unquoted).toContain("slide");
    expect(unquoted).toContain("node");
  });
});

describe("renderRailHtml", () => {
  test("lists each slide as a hash link", () => {
    const html = renderRailHtml([
      { slug: "intro", title: "intro" },
      { slug: "architecture", title: "architecture" },
    ]);
    expect(html).toContain('id="dek-rail"');
    expect(html).toContain('href="#intro"');
    expect(html).toContain('href="#architecture"');
    expect(html).toContain('data-slide-index="0"');
    expect(html).toContain('data-slide-index="1"');
  });
});

describe("renderDeckDocument", () => {
  test("embeds the supplied player script", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const { project, deck } = resolveDeck(join(root, "decks", "demo"));
        const html = await renderDeckDocument(deck, {
          mode: "player",
          inlineAssets: false,
          config: loadConfig(project.configPath),
          playerScript: "/* injected-player */",
        });
        expect(html).toContain("/* injected-player */");
      },
    );
  });

  test("uses lang from frontmatter on the document shell", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
lang: en
---

## intro

hello
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const { project, deck } = resolveDeck(join(root, "decks", "demo"));
        const html = await renderDeckDocument(deck, {
          mode: "player",
          inlineAssets: false,
          config: loadConfig(project.configPath),
          playerScript: "",
        });
        expect(html).toContain('<html lang="en">');
        expect(html).not.toContain('<html lang="ja">');
      },
    );
  });

  test("takes the document shell's lang from the script when frontmatter has none", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: デモ\n---\n\n## intro\n\nこんにちは\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const { project, deck } = resolveDeck(join(root, "decks", "demo"));
        const html = await renderDeckDocument(deck, {
          mode: "player",
          inlineAssets: false,
          config: loadConfig(project.configPath),
          playerScript: "",
        });
        expect(html).toContain('<html lang="ja">');
      },
    );
  });
});

describe("renderDeckHtml", () => {
  test("lists slides in a left rail in player mode", async () => {
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

## architecture

body
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const html = await renderPage(join(root, "decks", "demo"));
        expect(html).toContain('id="dek-rail"');
        expect(html).toContain('id="dek-rail-resize"');
        expect(html).toContain('href="#intro"');
        expect(html).toContain('href="#architecture"');
        expect(html).not.toContain('class="is-presenter"');
        expect(html).toContain("body.is-presenter #dek-rail");
      },
    );
  });

  test("shows the next slide title and beat indexes in presenter mode", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

### opening {#opening}

hello

## architecture

body
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const html = await renderPage(join(root, "decks", "demo"), { mode: "presenter" });
        expect(html).toContain('class="is-presenter"');
        expect(html).toContain('id="dek-shell"');
        expect(html).toContain('id="dek-current-stage"');
        expect(html).toContain('id="dek-next-stage"');
        expect(html).toContain('id="dek-progress"');
        expect(html).toContain('id="dek-page"');
        expect(html).toContain('id="dek-next"');
        expect(html).toMatch(/id="dek-next"[^>]*>[\s\S]*architecture/);
        expect(html).toContain('data-beat-index="0"');
        expect(html).not.toMatch(/id="dek-presenter" hidden/);
        expect(html).toContain('id="dek-rail"');
        expect(html).toContain('href="#intro"');
        expect(html).toContain("body.is-presenter #dek-rail");
      },
    );
  });

  test("shows elapsed time and section budget in presenter mode", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
duration: 20m
---

## intro

hello
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const html = await renderPage(join(root, "decks", "demo"), { mode: "presenter" });
        expect(html).toContain('id="dek-elapsed"');
        expect(html).toMatch(/id="dek-budget"[^>]*>20:00/);
        const data = JSON.parse(html.match(/id="dek-data">([^<]+)/)?.[1] ?? "[]") as Array<{
          slug: string;
          budgetSeconds?: number;
        }>;
        expect(data[0]).toMatchObject({ slug: "intro", budgetSeconds: 1200 });
      },
    );
  });

  test("omits budget when the deck has no duration", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const html = await renderPage(join(root, "decks", "demo"), { mode: "presenter" });
        expect(html).toMatch(/id="dek-budget"><\/p>/);
        const data = JSON.parse(html.match(/id="dek-data">([^<]+)/)?.[1] ?? "[]") as Array<{
          slug: string;
          budgetSeconds?: number;
        }>;
        expect(data[0]?.slug).toBe("intro");
        expect(data[0]?.budgetSeconds).toBeUndefined();
      },
    );
  });

  test("video mode drops presenter chrome", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const html = await renderPage(join(root, "decks", "demo"), { mode: "video" });
        expect(html).toContain('data-mode="video"');
        expect(html).toContain('data-deck="demo"');
        expect(html).not.toContain('id="dek-presenter"');
        expect(html).not.toContain('id="dek-rail"');
        expect(html).not.toContain('id="dek-rail-resize"');
      },
    );
  });
});

describe("key hint", () => {
  const english = `---
title: Demo
lang: en
---

## intro

hello
`;

  test("a built player names the rail and presenter keys in the deck's language", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: デモ\n---\n\n## intro\n\nこんにちは\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const html = await renderPage(join(root, "decks", "demo"));
        expect(html).toContain('id="dek-hint"');
        expect(html).toContain("<kbd>s</kbd>スライド一覧");
        expect(html).toContain("<kbd>p</kbd>プレゼンタービュー");
      },
    );
    await withTempProject(
      { decks: [{ name: "demo", script: english, slides: { intro: introHtml } }] },
      async (root) => {
        const html = await renderPage(join(root, "decks", "demo"));
        expect(html).toContain("<kbd>s</kbd>Slide rail");
        expect(html).toContain("<kbd>p</kbd>Presenter view");
        expect(html).not.toContain("スライド一覧");
      },
    );
  });

  test("leaves out the dev server, the presenter page, and video", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const dir = join(root, "decks", "demo");
        for (const options of [
          { live: true },
          { mode: "presenter" as const },
          { mode: "video" as const },
        ]) {
          expect(await renderPage(dir, options)).not.toContain('id="dek-hint"');
        }
      },
    );
  });

  test("names only the rail when the build has no presenter view", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const { project, deck } = resolveDeck(join(root, "decks", "demo"));
        const html = await renderDeckDocument(deck, {
          mode: "player",
          inlineAssets: false,
          includeNotes: false,
          config: loadConfig(project.configPath),
          playerScript: "",
        });
        expect(html).toContain("<kbd>s</kbd>");
        expect(html).not.toContain("<kbd>p</kbd>");
      },
    );
  });
});

describe("renderIndexHtml", () => {
  test("links each deck", () => {
    const html = renderIndexHtml([{ name: "demo", title: "Demo" }]);
    expect(html).toContain('href="/decks/demo/"');
    expect(html).toContain("demo");
    expect(html).toContain('<html lang="en">');
  });

  test("lists failed decks", () => {
    const html = renderIndexHtml([{ name: "demo", title: "Demo" }], [{ name: "orphan" }]);
    expect(html).toContain("orphan");
    expect(html).toContain("failed");
  });
});

describe("renderSlideHtml", () => {
  test("renders one slide at 1280x720 with is-shown for the requested beat", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `.slide { width: 1280px; height: 720px; overflow: hidden; }`,
            script: `---
title: Demo
---

## architecture

### script-parent

first

### slides-hang

second
`,
            slides: {
              architecture: slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">architecture</h2>
  <ul>
    <li data-step="script-parent">script.md が親</li>
    <li data-step="slides-hang">スライドがぶら下がる</li>
  </ul>
</section>`),
            },
          },
        ],
      },
      async (root) => {
        const { deck } = resolveDeck(join(root, "decks", "demo"));
        const html = renderSlideHtml(deck, "architecture", 0);
        expect(html).toContain("1280px");
        expect(html).toContain("720px");
        expect(html).toContain("is-current");
        expect(html).toMatch(
          /data-step="script-parent"[^>]*is-shown|is-shown[^>]*data-step="script-parent"/,
        );
        expect(html).not.toMatch(
          /data-step="slides-hang"[^>]*is-shown|is-shown[^>]*data-step="slides-hang"/,
        );
        expect(html).toContain('<html lang="en">');
      },
    );
  });

  test("reuses loaded theme css across beats after theme.css is removed", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `.slide { background: navy; }`,
            script: `---
title: Demo
---

## architecture

### one

a

### two

b
`,
            slides: { architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const { unlink } = await import("node:fs/promises");
        const { deck } = resolveDeck(join(root, "decks", "demo"));
        const sources = loadSlideSources(deck);
        const first = renderSlideHtml(deck, "architecture", 0, sources);
        await unlink(join(deck.dir, "theme.css"));
        const second = renderSlideHtml(deck, "architecture", 1, sources);
        expect(first).toContain("navy");
        expect(second).toContain("navy");
      },
    );
  });

  test("uses lang from frontmatter on the slide shell", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
lang: en
---

## intro

hello
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const { deck } = resolveDeck(join(root, "decks", "demo"));
        const html = renderSlideHtml(deck, "intro", 0);
        expect(html).toContain('<html lang="en">');
        expect(html).not.toContain('<html lang="ja">');
      },
    );
  });

  test("uses 1024 by 768 when the deck ratio is 4:3", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
ratio: 4:3
---

## intro

hello
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const { deck } = resolveDeck(join(root, "decks", "demo"));
        const html = renderSlideHtml(deck, "intro", 0);
        expect(html).toContain("1024px");
        expect(html).toContain("768px");
        const page = await renderPage(join(root, "decks", "demo"));
        expect(page).toContain("1024px");
        expect(page).toContain("768px");
      },
    );
  });

  test("inlines deck assets as data URIs", async () => {
    const withImage = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/pixel.png" alt="">
</section>`);
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: withImage } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
        const { deck } = resolveDeck(deckDir);
        const html = renderSlideHtml(deck, "intro", 0);
        expect(html).toContain("data:image/png;base64,");
        expect(html).not.toContain('src="assets/pixel.png"');
      },
    );
  });
});

describe("renderDeckHtml live", () => {
  test("keeps asset URLs and leaves theme CSS unminified", async () => {
    const withImage = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/pixel.png" alt="">
</section>`);
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `/* keep me */
.slide { width: 1280px; }
`,
            slides: { intro: withImage },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await copyFile(join(assetFixturesDir, "pixel.png"), join(deckDir, "assets", "pixel.png"));
        const html = await renderPage(deckDir, { live: true });
        expect(html).not.toContain("data:image/png;base64,");
        expect(html).toContain('src="assets/pixel.png"');
        expect(html).toContain("/* keep me */");
        expect(html).toContain("\n.slide");
      },
    );
  });

  test("renders a missing slide from its skeleton so indexes stay aligned", async () => {
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
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const html = await renderPage(join(root, "decks", "demo"), { live: true });
        expect(html).not.toContain('class="dek-diagnostics"');
        expect(html).toContain('data-slug="intro"');
        expect(html).toContain('data-slug="extra"');
        expect(html).not.toContain("data-missing");
        expect(html).toMatch(
          /data-slug="extra"[^>]*data-layout="title"|data-layout="title"[^>]*data-slug="extra"/,
        );
        const data = JSON.parse(html.match(/id="dek-data">([^<]+)/)?.[1] ?? "[]") as Array<{
          slug: string;
        }>;
        expect(data.map((slide) => slide.slug)).toEqual(["intro", "extra"]);
      },
    );
  });
});

describe("htmlShell", () => {
  test("sizes the page to the device, so a phone does not lay it out at desktop width", () => {
    expect(htmlShell({ body: "" })).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
  });
});
