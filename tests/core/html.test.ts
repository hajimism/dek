import { describe, expect, test } from "bun:test";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../../src/core/config.ts";
import { renderDeckDocument, renderDeckHtml, renderRailHtml } from "../../src/core/document.ts";
import { extractSlideSection, htmlShell, stampSlide } from "../../src/core/html.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { stepValuesForBeat } from "../../src/core/step.ts";
import { loadSlideSources, renderSlideHtml } from "../../src/core/still-page.ts";
import { playerEmbed } from "../helpers/embed.ts";
import { slideDocument, slidePlaces } from "../helpers/html.ts";
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

/** A deck of two slides, intro then architecture, as script.md orders them. */
const twoSlideDeck = {
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
};

/** The page for a build, for video, or the dev server's player or presenter page. */
async function renderPage(
  dir: string,
  target: { kind?: "build" | "video" } | { kind: "dev"; mode?: "player" | "presenter" } = {},
) {
  const embed = await playerEmbed();
  return renderDeckHtml(dir, {
    playerScript: embed.playerScript,
    target:
      target.kind === "dev"
        ? {
            kind: "dev",
            mode: target.mode ?? "player",
            includeNotes: true,
            liveReloadScript: embed.liveReloadScript,
          }
        : { kind: target.kind ?? "build" },
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

describe("stampSlide", () => {
  const place = { number: 1, count: 1 };

  test("does not overwrite an existing data-slug", () => {
    const html = `<section class="slide" data-slug="kept"><h2>intro</h2></section>`;
    expect(stampSlide(html, { slug: "intro", place })).toContain('data-slug="kept"');
    expect(stampSlide(html, { slug: "intro", place })).not.toContain('data-slug="intro"');
  });

  test("adds data-slug to an unquoted slide section", () => {
    const html = `<section class=slide data-layout="title"><h2>intro</h2></section>`;
    expect(stampSlide(html, { slug: "intro", place })).toContain('data-slug="intro"');
  });

  test("marks the current slide and shown data-step values", () => {
    const html = `<section class="slide"><li data-step="hook">a</li><li data-step="2">b</li></section>`;
    const shown = stepValuesForBeat([{ id: "hook" }, {}], 1);
    const next = stampSlide(html, { slug: "s", place, shown });
    expect(next).toContain("is-current");
    expect(next).toMatch(/data-step="hook"[^>]*is-shown|is-shown[^>]*data-step="hook"/);
    expect(next).not.toMatch(/data-step="2"[^>]*is-shown|is-shown[^>]*data-step="2"/);
  });

  test("keeps existing classes on quoted and unquoted tags", () => {
    const quoted = stampSlide(
      `<section class="slide title"><p class="node" data-step="hook">a</p></section>`,
      { slug: "s", place, shown: new Set(["hook"]) },
    );
    expect(quoted).toMatch(/class="[^"]*slide[^"]*is-current|class="[^"]*is-current[^"]*slide/);
    expect(quoted).toMatch(/class="[^"]*node[^"]*is-shown|class="[^"]*is-shown[^"]*node/);

    const unquoted = stampSlide(
      `<section class=slide><p class=node data-step="hook">a</p></section>`,
      { slug: "s", place, shown: new Set(["hook"]) },
    );
    expect(unquoted).toContain("is-current");
    expect(unquoted).toContain("is-shown");
    expect(unquoted).toContain("slide");
    expect(unquoted).toContain("node");
  });

  test("gives the slide its place in the script as custom properties", () => {
    const html = stampSlide(`<section class="slide"><h2>b</h2></section>`, {
      slug: "b",
      place: { number: 2, count: 3 },
    });
    expect(html).toContain('style="--dekc-slide-number: 2; --dekc-slide-count: 3"');
  });

  test("keeps the author's inline style after the place, so it can override it", () => {
    const html = stampSlide(`<section class="slide" style="color: red"><h2>b</h2></section>`, {
      slug: "b",
      place: { number: 2, count: 3 },
    });
    expect(html).toContain('style="--dekc-slide-number: 2; --dekc-slide-count: 3; color: red"');
  });

  test("stamps the place on the slide alone, not on a section inside it", () => {
    const html = stampSlide(
      `<section class="slide"><section class="slide-part">a</section></section>`,
      { slug: "a", place: { number: 1, count: 1 } },
    );
    expect(html.match(/--dekc-slide-number/g)).toHaveLength(1);
  });
});

describe("renderRailHtml", () => {
  test("lists each slide as a hash link", () => {
    const html = renderRailHtml([
      { slug: "intro", title: "intro" },
      { slug: "architecture", title: "architecture" },
    ]);
    expect(html).toContain('id="dekc-rail"');
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
        const html = renderDeckDocument(deck, {
          config: loadConfig(project.configPath),
          playerScript: "/* injected-player */",
          target: { kind: "build" },
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
        const html = renderDeckDocument(deck, {
          config: loadConfig(project.configPath),
          playerScript: "",
          target: { kind: "build" },
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
        const html = renderDeckDocument(deck, {
          config: loadConfig(project.configPath),
          playerScript: "",
          target: { kind: "build" },
        });
        expect(html).toContain('<html lang="ja">');
      },
    );
  });
});

describe("renderDeckHtml", () => {
  test("numbers every slide in script order, against the deck's count", async () => {
    await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
      const html = await renderPage(join(root, "decks", "demo"));
      expect(slidePlaces(html)).toEqual([
        { slug: "intro", number: 1, count: 2 },
        { slug: "architecture", number: 2, count: 2 },
      ]);
    });
  });

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
        expect(html).toContain('id="dekc-rail"');
        expect(html).toContain('id="dekc-rail-resize"');
        expect(html).toContain('href="#intro"');
        expect(html).toContain('href="#architecture"');
        expect(html).not.toContain('class="is-presenter"');
        expect(html).toContain("body.is-presenter #dekc-rail");
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
        const html = await renderPage(join(root, "decks", "demo"), {
          kind: "dev",
          mode: "presenter",
        });
        expect(html).toContain('class="is-presenter"');
        expect(html).toContain('id="dekc-shell"');
        expect(html).toContain('id="dekc-current-stage"');
        expect(html).toContain('id="dekc-next-stage"');
        expect(html).toContain('id="dekc-progress"');
        expect(html).toContain('id="dekc-page"');
        expect(html).toContain('id="dekc-next"');
        expect(html).toMatch(/id="dekc-next"[^>]*>[\s\S]*architecture/);
        expect(html).toContain('data-beat-index="1"');
        expect(html).not.toMatch(/id="dekc-presenter" hidden/);
        expect(html).toContain('id="dekc-rail"');
        expect(html).toContain('href="#intro"');
        expect(html).toContain("body.is-presenter #dekc-rail");
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
        const html = await renderPage(join(root, "decks", "demo"), {
          kind: "dev",
          mode: "presenter",
        });
        expect(html).toContain('id="dekc-elapsed"');
        expect(html).toMatch(/id="dekc-budget"[^>]*>20:00/);
        const data = JSON.parse(html.match(/id="dekc-data">([^<]+)/)?.[1] ?? "[]") as Array<{
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
        const html = await renderPage(join(root, "decks", "demo"), {
          kind: "dev",
          mode: "presenter",
        });
        expect(html).toMatch(/id="dekc-budget"><\/p>/);
        const data = JSON.parse(html.match(/id="dekc-data">([^<]+)/)?.[1] ?? "[]") as Array<{
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
        const html = await renderPage(join(root, "decks", "demo"), { kind: "video" });
        expect(html).toContain('data-mode="video"');
        expect(html).toContain('data-deck="demo"');
        expect(html).not.toContain('id="dekc-presenter"');
        expect(html).not.toContain('id="dekc-rail"');
        expect(html).not.toContain('id="dekc-rail-resize"');
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
        expect(html).toContain('id="dekc-hint"');
        expect(html).toContain("<kbd>s</kbd>スライド一覧");
        expect(html).toContain("<kbd>p</kbd>発表者ビュー");
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
          { kind: "dev" as const },
          { kind: "dev" as const, mode: "presenter" as const },
          { kind: "video" as const },
        ]) {
          expect(await renderPage(dir, options)).not.toContain('id="dekc-hint"');
        }
      },
    );
  });
});

describe("renderSlideHtml", () => {
  test("numbers a slide shown alone by its place in the whole deck", async () => {
    await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
      const { deck } = resolveDeck(join(root, "decks", "demo"));
      const html = renderSlideHtml(loadSlideSources(deck), "architecture", 0);
      expect(slidePlaces(html)).toEqual([{ slug: "architecture", number: 2, count: 2 }]);
    });
  });

  test("keeps the slide's own stylesheet apart from the theme, and no other slide's", async () => {
    await withTempProject(
      {
        decks: [
          {
            ...twoSlideDeck,
            theme: `.slide { background: navy; }`,
            styles: {
              intro: `.intro-mark { color: teal; }`,
              architecture: `.arch-mark { color: olive; }`,
            },
          },
        ],
      },
      async (root) => {
        const { deck } = resolveDeck(join(root, "decks", "demo"));
        const html = renderSlideHtml(loadSlideSources(deck), "architecture", 0);
        const own = html.match(/<style id="dekc-slide-css">([\s\S]*?)<\/style>/)?.[1] ?? "";
        expect(own).toContain('.slide:where([data-slug="architecture"]) .arch-mark');
        expect(own).not.toContain("navy");
        expect(html).toContain("navy");
        expect(html).not.toContain("intro-mark");
      },
    );
  });

  test("gives a slide with no stylesheet of its own no slide style element", async () => {
    await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
      const { deck } = resolveDeck(join(root, "decks", "demo"));
      const html = renderSlideHtml(loadSlideSources(deck), "architecture", 0);
      expect(html).not.toContain("dekc-slide-css");
    });
  });

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
        const html = renderSlideHtml(loadSlideSources(deck), "architecture", 1);
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
        const first = renderSlideHtml(sources, "architecture", 0);
        await unlink(join(deck.dir, "theme.css"));
        const second = renderSlideHtml(sources, "architecture", 1);
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
        const html = renderSlideHtml(loadSlideSources(deck), "intro", 0);
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
        const html = renderSlideHtml(loadSlideSources(deck), "intro", 0);
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
        const html = renderSlideHtml(loadSlideSources(deck), "intro", 0);
        expect(html).toContain("data:image/png;base64,");
        expect(html).not.toContain('src="assets/pixel.png"');
      },
    );
  });
});

describe("renderDeckHtml live", () => {
  test("carries no link preview tags; only a build is shared as a link", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const html = await renderPage(join(root, "decks", "demo"), { kind: "dev" });
        expect(html).not.toContain("og:title");
      },
    );
  });

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
        const html = await renderPage(deckDir, { kind: "dev" });
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
        const html = await renderPage(join(root, "decks", "demo"), { kind: "dev" });
        expect(html).not.toContain('class="dekc-diagnostics"');
        expect(html).toContain('data-slug="intro"');
        expect(html).toContain('data-slug="extra"');
        expect(html).not.toContain("data-missing");
        expect(html).toMatch(
          /data-slug="extra"[^>]*data-layout="title"|data-layout="title"[^>]*data-slug="extra"/,
        );
        const data = JSON.parse(html.match(/id="dekc-data">([^<]+)/)?.[1] ?? "[]") as Array<{
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

describe("extractSlideSection reads markup the way the browser does", () => {
  test("skips a slide written inside a comment", () => {
    const html = `<!-- <section class="slide">old</section> --><section class="slide">new</section>`;
    expect(extractSlideSection(html)).toBe(`<section class="slide">new</section>`);
  });

  test("does not take data-class for class", () => {
    const html = `<section data-class="slide">no</section><section class="slide">yes</section>`;
    expect(extractSlideSection(html)).toBe(`<section class="slide">yes</section>`);
  });

  test("finds none when no section is a slide", () => {
    expect(extractSlideSection(`<section data-class="slide">no</section>`)).toBeUndefined();
  });
});
