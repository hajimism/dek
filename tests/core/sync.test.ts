import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
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

  test("refreshes a skeleton nobody edited when the script changes", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: postmortem\n---\n\n## intro\n\n## plan\n\n### one\n",
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await rm(join(deckDir, "slides"), { recursive: true, force: true });
        syncDeck(deckDir);
        await writeFile(
          join(deckDir, "script.md"),
          "---\ntitle: The Bug That Was a Design\n---\n\n## intro\n\n## plan\n\n### one\n\n### two\n",
        );

        const result = syncDeck(deckDir);

        expect(result).toEqual({
          created: [],
          updated: [join(deckDir, "slides", "intro.html"), join(deckDir, "slides", "plan.html")],
          removed: [],
        });
        const intro = await readFile(join(deckDir, "slides", "intro.html"), "utf8");
        expect(intro).toContain('<h2 class="slide-title">The Bug That Was a Design</h2>');
        const plan = await readFile(join(deckDir, "slides", "plan.html"), "utf8");
        expect(plan).toContain('<li data-step="two">two</li>');
        expect(syncDeck(deckDir)).toEqual({ created: [], updated: [], removed: [] });
      },
    );
  });

  test("never rewrites a skeleton the author has touched", async () => {
    await withTempProject(
      { decks: [{ name: "demo", script: "---\ntitle: postmortem\n---\n\n## intro\n" }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const introPath = join(deckDir, "slides", "intro.html");
        await rm(join(deckDir, "slides"), { recursive: true, force: true });
        syncDeck(deckDir);
        const touched = (await readFile(introPath, "utf8")).replace(
          "</h2>",
          "</h2>\n  <p>mine</p>",
        );
        await writeFile(introPath, touched);
        await writeFile(join(deckDir, "script.md"), "---\ntitle: Renamed\n---\n\n## intro\n");

        expect(syncDeck(deckDir).updated).toEqual([]);
        expect(await readFile(introPath, "utf8")).toBe(touched);
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
        // The empty heading is a warning that says how to title it, not a silent pass.
        expect(lintDeck(deckDir).map((d) => [d.id, d.severity, d.slug])).toEqual([
          ["DEK024", "warning", "recap"],
        ]);
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

  test("removes an orphan skeleton nobody edited, since the script no longer asks for it", async () => {
    await withTempProject(
      {
        decks: [
          { name: "demo", script: "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### one\n" },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const slidesDir = join(deckDir, "slides");
        await rm(slidesDir, { recursive: true, force: true });
        syncDeck(deckDir);
        await writeFile(
          join(deckDir, "script.md"),
          "---\ntitle: Demo\n---\n\n## intro\n\n## mine\n",
        );

        const result = syncDeck(deckDir);
        expect(result.removed).toEqual([join(slidesDir, "plan.html")]);
        expect(result.created).toEqual([join(slidesDir, "mine.html")]);
        expect(existsSync(join(slidesDir, "plan.html"))).toBe(false);
        expect(lintDeck(deckDir).filter((d) => d.id === "DEK002")).toEqual([]);
        expect(syncDeck(deckDir)).toEqual({ created: [], updated: [], removed: [] });
      },
    );
  });

  test("keeps an orphan skeleton that has a stylesheet or script beside it", async () => {
    for (const sidecar of ["plan.css", "plan.ts", "plan.js"]) {
      await withTempProject(
        {
          decks: [
            { name: "demo", script: "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### one\n" },
          ],
        },
        async (root) => {
          const deckDir = join(root, "decks", "demo");
          const slidesDir = join(deckDir, "slides");
          await rm(slidesDir, { recursive: true, force: true });
          syncDeck(deckDir);
          await writeFile(join(slidesDir, sidecar), "/* mine */\n");
          await writeFile(join(deckDir, "script.md"), "---\ntitle: Demo\n---\n\n## intro\n");

          expect(syncDeck(deckDir).removed).toEqual([]);
          expect(existsSync(join(slidesDir, "plan.html"))).toBe(true);
        },
      );
    }
  });

  test("never loses an edited slide while a heading id flickers mid-edit", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n",
            slides: { intro: customIntro },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const slidesDir = join(deckDir, "slides");
        // Saved while typing: `## intro` becomes `## intr`, then `## intro` again.
        await writeFile(join(deckDir, "script.md"), "---\ntitle: Demo\n---\n\n## intr\n");
        const typing = syncDeck(deckDir);
        expect(typing.removed).toEqual([]);
        expect(typing.created).toEqual([join(slidesDir, "intr.html")]);

        await writeFile(join(deckDir, "script.md"), "---\ntitle: Demo\n---\n\n## intro\n");
        const done = syncDeck(deckDir);
        expect(done.removed).toEqual([join(slidesDir, "intr.html")]);
        expect(await readFile(join(slidesDir, "intro.html"), "utf8")).toBe(customIntro);
        expect(existsSync(join(slidesDir, "intr.html"))).toBe(false);
      },
    );
  });

  test("keeps orphan HTML the author edited", async () => {
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
        expect(result.removed).toEqual([]);
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
        expect(agents).toContain("For a layout's markup, run `dek theme <layout>`.");
        expect(agents).toContain("A deck's own `theme.css` can differ");
        expect(agents).toContain("`onclick=`");
        expect(agents).toContain("`javascript:` URLs");
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
        expect(agents.startsWith("keep me\n")).toBe(true);
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

  test("rewrites only dek's block in AGENTS.md and keeps the author's notes around it", async () => {
    await withTempProject(
      { theme: ".slide .figure { display: block; }\n", decks: [{ name: "demo" }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const path = join(root, "AGENTS.md");
        await writeFile(path, "# Our team\n\nWrite in Japanese.\n");
        syncDeck(deckDir);
        const first = await readFile(path, "utf8");
        expect(first.startsWith("# Our team\n\nWrite in Japanese.\n\n<!-- dek:begin")).toBe(true);
        expect(first.endsWith("<!-- dek:end -->\n")).toBe(true);

        await writeFile(path, `${first}\n## After\n\nMore notes.\n`);
        await writeFile(join(root, "theme.css"), ".slide .chart { display: block; }\n");
        syncDeck(deckDir);
        const second = await readFile(path, "utf8");
        expect(second.startsWith("# Our team\n\nWrite in Japanese.\n\n<!-- dek:begin")).toBe(true);
        expect(second.endsWith("<!-- dek:end -->\n\n## After\n\nMore notes.\n")).toBe(true);
        expect(second).toContain("`chart`");
        expect(second).not.toContain("`figure`");
        expect(second.match(/<!-- dek:begin/g)).toHaveLength(1);
      },
    );
  });

  test("replaces an AGENTS.md that is exactly dek's own unmarked output", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const path = join(root, "AGENTS.md");
      syncDeck(join(root, "decks", "demo"));
      const marked = await readFile(path, "utf8");
      const unmarked = marked
        .replace(/^<!-- dek:begin.*-->\n/, "")
        .replace(/<!-- dek:end -->\n$/, "");
      await writeFile(path, unmarked);
      syncDeck(join(root, "decks", "demo"));
      expect(await readFile(path, "utf8")).toBe(marked);
    });
  });

  test("appends dek's block after a begin marker that has no end", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const path = join(root, "AGENTS.md");
      await writeFile(path, "<!-- dek:begin -->\nmine\n");
      syncDeck(join(root, "decks", "demo"));
      syncDeck(join(root, "decks", "demo"));
      const agents = await readFile(path, "utf8");
      expect(agents.startsWith("<!-- dek:begin -->\nmine\n\n<!-- dek:begin")).toBe(true);
      expect(agents.match(/<!-- dek:end -->/g)).toHaveLength(1);
    });
  });

  test("leaves an unchanged AGENTS.md alone", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const path = join(root, "AGENTS.md");
      syncDeck(join(root, "decks", "demo"));
      const past = new Date("2020-01-01T00:00:00Z");
      await utimes(path, past, past);
      syncDeck(join(root, "decks", "demo"));
      expect((await stat(path)).mtime.getTime()).toBe(past.getTime());
    });
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
