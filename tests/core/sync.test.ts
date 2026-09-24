import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError, lintDeck, resolveDeck, syncDeck } from "../../src/core/index.ts";
import { extractSlide } from "../helpers/html.ts";
import { defaultScript, withTempProject } from "../helpers/project.ts";

const customIntro = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="../theme.css">
</head>
<body>
  <section class="slide" data-layout="title">
    <h2 class="slide-title">keep me</h2>
  </section>
</body>
</html>
`;

describe("syncDeck", () => {
  test("creates missing slides and leaves existing HTML unchanged", async () => {
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

## extra {#extra}

more
`,
            slides: { intro: customIntro },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const result = syncDeck(deckDir);

        expect(result.created.some((path) => path.endsWith("slides/extra.html"))).toBe(true);
        expect(await readFile(join(deckDir, "slides", "intro.html"), "utf8")).toBe(customIntro);

        const extra = await readFile(join(deckDir, "slides", "extra.html"), "utf8");
        expect(extra).not.toContain("<!DOCTYPE html>");
        expect(extra.trimStart().startsWith('<section class="slide"')).toBe(true);
        expect(extractSlide(extra)).toContain('data-layout="title"');
        expect(extractSlide(extra)).toContain('<h2 class="slide-title"></h2>');
      },
    );
  });

  test("builds a title skeleton when a section has no beats", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", script: defaultScript() }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        syncDeck(deckDir);
        const html = await readFile(join(deckDir, "slides", "intro.html"), "utf8");
        expect(html).not.toContain("<!DOCTYPE html>");
        expect(html.trimStart().startsWith('<section class="slide"')).toBe(true);
        expect(extractSlide(html)).toBe(
          '<section class="slide" data-layout="title"><h2 class="slide-title">Demo</h2></section>',
        );
      },
    );
  });

  test("leaves the heading empty when a later section is only an id", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## cover

hello

## recap

more

## 締め {#close}

bye
`,
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        syncDeck(deckDir);
        const cover = await readFile(join(deckDir, "slides", "cover.html"), "utf8");
        expect(extractSlide(cover)).toContain('<h2 class="slide-title">Demo</h2>');
        const recap = await readFile(join(deckDir, "slides", "recap.html"), "utf8");
        expect(extractSlide(recap)).toContain('<h2 class="slide-title"></h2>');
        expect(recap).not.toContain(">recap<");
        const close = await readFile(join(deckDir, "slides", "close.html"), "utf8");
        expect(extractSlide(close)).toContain('<h2 class="slide-title">締め</h2>');
        expect(lintDeck(deckDir)).toEqual([]);
      },
    );
  });

  test("keeps Japanese titles and names data-step from beat ids or 1-based numbers", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## 発表の前日に何をしていますか {#problem}

みなさん

## architecture

body

### script.md が親 {#script-parent}

a

### ただの区切り

b

### 逆だと喋れない {#inverted}

c
`,
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        syncDeck(deckDir);

        const problem = await readFile(join(deckDir, "slides", "problem.html"), "utf8");
        expect(extractSlide(problem)).toContain(
          '<h2 class="slide-title">発表の前日に何をしていますか</h2>',
        );

        const architecture = await readFile(join(deckDir, "slides", "architecture.html"), "utf8");
        const slide = extractSlide(architecture);
        expect(slide).toContain('data-layout="default"');
        expect(slide).toContain('<h2 class="slide-title"></h2>');
        expect(slide).not.toContain(">architecture<");
        expect(slide).toContain('<li data-step="script-parent">script.md が親</li>');
        expect(slide).toContain('<li data-step="2">ただの区切り</li>');
        expect(slide).toContain('<li data-step="inverted">逆だと喋れない</li>');
      },
    );
  });

  test("writes .dek/schema.json at the project root", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      syncDeck(join(root, "decks", "demo"));
      const schemaPath = join(root, ".dek", "schema.json");
      expect(existsSync(schemaPath)).toBe(true);
      const schema = JSON.parse(await readFile(schemaPath, "utf8")) as {
        required?: string[];
      };
      expect(schema.required).toContain("title");
    });
  });

  test("does not delete orphan HTML files", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            slides: {
              intro: customIntro,
              leftover: customIntro.replace("keep me", "orphan"),
            },
          },
        ],
      },
      async (root) => {
        const leftover = join(root, "decks", "demo", "slides", "leftover.html");
        const result = syncDeck(join(root, "decks", "demo"));
        expect(existsSync(leftover)).toBe(true);
        expect(result.created.some((path) => path.endsWith("leftover.html"))).toBe(false);
        expect(await readFile(leftover, "utf8")).toContain("orphan");
      },
    );
  });

  test("creates slides/ when it is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const slidesDir = join(root, "decks", "demo", "slides");
      await rm(slidesDir, { recursive: true, force: true });
      syncDeck(join(root, "decks", "demo"));
      expect(existsSync(join(slidesDir, "intro.html"))).toBe(true);
    });
  });

  test("writes AGENTS.md with theme classes, layouts, and a help pointer", async () => {
    await withTempProject(
      {
        theme: `.slide { width: 1280px; }
.slide .node { color: red; }
.slide[data-layout="two-col"] { display: grid; }
.slide[data-layout="quote"] { font-style: italic; }
`,
        decks: [{ name: "demo" }],
      },
      async (root) => {
        syncDeck(join(root, "decks", "demo"));
        const agents = await readFile(join(root, "AGENTS.md"), "utf8");
        expect(agents).toContain("node");
        expect(agents).toContain("two-col");
        expect(agents).toContain("quote");
        expect(agents).toContain("dek help --agent");
        expect(agents).toContain("script.md");
        expect(agents).toContain("self-contained");
        expect(agents).toContain("lint");
        expect(agents).toContain("slides/<id>.css");
        expect(agents).toContain("slides/<id>.ts");
        expect(agents).toContain("satisfies DekSlide");
        expect(agents).toContain("find elements by data-* attributes");
      },
    );
  });

  test("writes AGENTS.md with theme tokens from the project theme", async () => {
    await withTempProject(
      {
        theme: `.slide {
  --fg: #fff;
  --bg: #111;
  --extra: 1;
}
`,
        decks: [{ name: "demo" }],
      },
      async (root) => {
        syncDeck(join(root, "decks", "demo"));
        const agents = await readFile(join(root, "AGENTS.md"), "utf8");
        expect(agents).toContain("## Theme tokens");
        expect(agents).toContain("`--fg`");
        expect(agents).toContain("`--bg`");
        expect(agents).toContain("`--extra`");
        expect(agents).toContain("token");
      },
    );
  });

  test("rewrites AGENTS.md from the project theme, not the deck theme", async () => {
    await withTempProject(
      {
        theme: `.slide { --fg: #fff; width: 100%; }
.slide .figure { display: block; }
.slide[data-layout="full-bleed"] { padding: 0; }
`,
        decks: [
          {
            name: "demo",
            theme: `.slide { --deck-only: 1; width: 100%; }
.slide .deck-only { color: inherit; }
`,
          },
          {
            name: "other",
            theme: `.slide .other-only { color: green; }
`,
          },
        ],
      },
      async (root) => {
        const path = join(root, "AGENTS.md");
        await Bun.write(path, "keep me\n");
        syncDeck(join(root, "decks", "demo"));
        syncDeck(join(root, "decks", "other"));
        const agents = await readFile(path, "utf8");
        expect(agents).not.toContain("keep me");
        expect(agents).toContain("figure");
        expect(agents).toContain("full-bleed");
        expect(agents).not.toContain("deck-only");
        expect(agents).not.toContain("other-only");
        expect(agents).toContain("`--fg`");
        expect(agents).not.toContain("`--deck-only`");
        expect(agents).toContain("script.md");
        expect(agents).toContain("self-contained");
        expect(agents).toContain("lint");
        expect(agents).toContain("dek help --agent");
      },
    );
  });

  test("syncs a parsed deck without re-reading script.md", async () => {
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
          },
        ],
      },
      async (root) => {
        const resolved = resolveDeck(join(root, "decks", "demo"));
        await writeFile(join(root, "decks", "demo", "script.md"), "this is not a deck\n");
        expect(() => syncDeck(resolved.deck.dir)).toThrow(DekError);
        const result = syncDeck(resolved);
        expect(result.created.some((path) => path.endsWith("slides/intro.html"))).toBe(true);
        expect(result.created.some((path) => path.endsWith("slides/extra.html"))).toBe(true);
      },
    );
  });
});
