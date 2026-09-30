import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { extname, join } from "node:path";
import { defaultTheme } from "../../src/cli/files.ts";
import { newCommand } from "../../src/cli/new.ts";
import { DekError } from "../../src/core/error.ts";
import { lintDeck } from "../../src/core/lint.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { syncDeck } from "../../src/core/sync.ts";
import { withTempDir } from "../helpers/fs.ts";
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

        expect(result).toMatchObject({
          created: [],
          updated: [join(deckDir, "slides", "intro.html"), join(deckDir, "slides", "plan.html")],
          removed: [],
          kept: [],
        });
        const intro = await readFile(join(deckDir, "slides", "intro.html"), "utf8");
        expect(intro).toContain('<h2 class="slide-title">The Bug That Was a Design</h2>');
        const plan = await readFile(join(deckDir, "slides", "plan.html"), "utf8");
        expect(plan).toContain('<li data-step="two">two</li>');
        expect(syncDeck(deckDir)).toEqual({
          created: [],
          updated: [],
          removed: [],
          kept: [],
          dekFiles: { created: [], updated: [] },
        });
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

  // A skeleton is dek's to rewrite only while it is byte for byte what dek last wrote there. The
  // shape of one is no proof: an author who retypes the heading or a beat keeps the shape.
  test("keeps a skeleton whose heading the author retyped", async () => {
    await withTempProject(
      { decks: [{ name: "demo", script: "---\ntitle: Demo\n---\n\n## intro\n" }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const introPath = join(deckDir, "slides", "intro.html");
        syncDeck(deckDir);
        const retyped = (await readFile(introPath, "utf8")).replace(
          /<h2 class="slide-title">[^<]*<\/h2>/,
          '<h2 class="slide-title">A heading of my own</h2>',
        );
        await writeFile(introPath, retyped);

        expect(syncDeck(deckDir).updated).toEqual([]);
        expect(await readFile(introPath, "utf8")).toBe(retyped);
      },
    );
  });

  test("keeps a slide whose section is gone once the author retyped a beat", async () => {
    await withTempProject(
      {
        decks: [
          { name: "demo", script: "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### one\n" },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const planPath = join(deckDir, "slides", "plan.html");
        syncDeck(deckDir);
        const retyped = (await readFile(planPath, "utf8")).replace(">one</li>", ">mine</li>");
        await writeFile(planPath, retyped);
        await writeFile(join(deckDir, "script.md"), "---\ntitle: Demo\n---\n\n## intro\n");

        expect(syncDeck(deckDir).removed).toEqual([]);
        expect(await readFile(planPath, "utf8")).toBe(retyped);
      },
    );
  });

  test("still removes a skeleton nobody edited once its section is gone", async () => {
    await withTempProject(
      {
        decks: [
          { name: "demo", script: "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### one\n" },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        syncDeck(deckDir);
        await writeFile(join(deckDir, "script.md"), "---\ntitle: Demo\n---\n\n## intro\n");

        expect(syncDeck(deckDir).removed).toEqual([join(deckDir, "slides", "plan.html")]);
        expect(existsSync(join(deckDir, "slides", "plan.html"))).toBe(false);
      },
    );
  });

  test("refreshes a skeleton dek new wrote after the script is edited", async () => {
    await withTempProject({ theme: defaultTheme() }, async (root) => {
      newCommand({ cwd: root, name: "talk" });
      const deckDir = join(root, "decks", "talk");
      await writeFile(join(deckDir, "script.md"), "---\ntitle: Retitled\n---\n\n## intro\n");

      expect(syncDeck(deckDir).updated).toEqual([join(deckDir, "slides", "intro.html")]);
      expect(await readFile(join(deckDir, "slides", "intro.html"), "utf8")).toContain(
        ">Retitled</h2>",
      );
    });
  });

  // What dek wrote is kept under .cache, which anyone may delete. Losing it costs only refreshes:
  // a slide that is exactly today's skeleton is dek's all the same, and anything else stays.
  test("without its record, rewrites only what it can prove is its own", async () => {
    await withTempProject(
      {
        decks: [
          { name: "demo", script: "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### one\n" },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const planPath = join(deckDir, "slides", "plan.html");
        syncDeck(deckDir);
        await rm(join(deckDir, ".cache"), { recursive: true, force: true });
        await writeFile(
          join(deckDir, "script.md"),
          "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### two\n",
        );
        const before = await readFile(planPath, "utf8");

        expect(syncDeck(deckDir).updated).toEqual([]);
        expect(await readFile(planPath, "utf8")).toBe(before);

        await rm(join(deckDir, ".cache"), { recursive: true, force: true });
        await writeFile(
          planPath,
          before.replace(">one</li>", ">two</li>").replace('"one"', '"two"'),
        );
        syncDeck(deckDir);
        await writeFile(
          join(deckDir, "script.md"),
          "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### three\n",
        );
        expect(syncDeck(deckDir).updated).toEqual([planPath]);
      },
    );
  });

  test("a skeleton dek mv moved is still dek's to refresh", async () => {
    await withTempProject(
      {
        decks: [
          { name: "demo", script: "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### one\n" },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        syncDeck(deckDir);
        await writeFile(
          join(deckDir, "script.md"),
          "---\ntitle: Demo\n---\n\n## intro\n\n## steps\n\n### one\n",
        );
        await rename(join(deckDir, "slides", "plan.html"), join(deckDir, "slides", "steps.html"));
        await writeFile(
          join(deckDir, "script.md"),
          "---\ntitle: Demo\n---\n\n## intro\n\n## steps\n\n### one\n\n### two\n",
        );

        expect(syncDeck(deckDir).updated).toEqual([join(deckDir, "slides", "steps.html")]);
      },
    );
  });

  test("uses only layouts the deck's theme lays out", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n\n## plan\n\n### one\n",
            theme: `.slide { width: 100%; }
.slide[data-layout="cover"] { display: grid; }
.slide[data-layout="default"] { display: flex; }
`,
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        syncDeck(deckDir);
        const intro = await readFile(join(deckDir, "slides", "intro.html"), "utf8");
        const plan = await readFile(join(deckDir, "slides", "plan.html"), "utf8");
        expect(intro.startsWith('<section class="slide">\n')).toBe(true);
        expect(plan.startsWith('<section class="slide" data-layout="default">\n')).toBe(true);
        expect(lintDeck(deckDir).filter((d) => d.id === "DEK019")).toEqual([]);
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
        expect(syncDeck(deckDir)).toEqual({
          created: [],
          updated: [],
          removed: [],
          kept: [],
          dekFiles: { created: [], updated: [] },
        });
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

  test("writes AGENTS.md with the conventions and a help pointer", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      syncDeck(join(root, "decks", "demo"));
      const agents = await readFile(join(root, "AGENTS.md"), "utf8");
      expect(agents).toContain("dek help --agent");
      expect(agents).toContain("script.md");
      expect(agents).toContain("self-contained");
      expect(agents).toContain("slides/<id>.css");
      expect(agents).toContain("slides/<id>.ts");
      expect(agents).toContain("satisfies DekSlide");
      expect(agents).toContain("find elements by data-* attributes");
      expect(agents).toContain("`onclick=`");
      expect(agents).toContain("`javascript:` URLs");
      expect(agents).toContain("a token of its own on that slide's `.slide`");
      expect(agents).toContain("dek shot --sheet");
      expect(agents).toContain("dek shot <slug> --motion");
      expect(agents).toContain("dek shot <a> --to <b> --at 0.5");
      expect(agents).toContain("`--dek-slide-number` and `--dek-slide-count`");
      expect(agents).toContain("never by hand");
      expect(agents).toContain("When a hint sends a fix to `theme.css`, make it there");
    });
  });

  // What an agent otherwise reads the guides for, or finds out by a failed open.
  test("AGENTS.md states the class budget, how slide CSS weighs, and that shots move", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      syncDeck(join(root, "decks", "demo"));
      const agents = await readFile(join(root, "AGENTS.md"), "utf8");
      expect(agents).toContain("`max_classes` in `dek.toml`, 40 by default (`DEK013`)");
      expect(agents).toContain("as if it were written at the end of `theme.css`");
      expect(agents).toContain('`.slide[data-layout="split"] .x`');
      expect(agents).toContain("Never reuse a shot's path from before an edit");
      expect(agents).toContain("`fill` says how much of the frame the slide fills");
    });
  });

  test("AGENTS.md says where lint stops and judgment begins", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      syncDeck(join(root, "decks", "demo"));
      const agents = await readFile(join(root, "AGENTS.md"), "utf8");
      expect(agents).not.toContain("a deck is done when lint passes");
      expect(agents).toContain("A deck is not done while `dek lint --visual` fails");
      expect(agents).toContain("## Before you report a deck as done");
      expect(agents).toContain("Say what you could not judge");
    });
  });

  // Each deck owns its theme.css, so a list read from the project theme is wrong for any deck
  // whose copy has grown. AGENTS.md names none of it and sends the agent to the deck's own theme.
  test("AGENTS.md lists nothing a deck's theme decides, and points to dek theme", async () => {
    await withTempProject(
      {
        theme: `.slide { --fg: #fff; width: 100%; }
.slide .figure { display: block; }
.slide[data-layout="full-bleed"] { padding: 0; }
`,
        decks: [{ name: "demo" }],
      },
      async (root) => {
        const path = join(root, "AGENTS.md");
        syncDeck(join(root, "decks", "demo"));
        const agents = await readFile(path, "utf8");
        expect(agents).not.toContain("figure");
        expect(agents).not.toContain("full-bleed");
        expect(agents).not.toContain("`--fg`");
        expect(agents).toContain("dek theme");
        expect(agents).toContain("dek theme <layout>");

        await writeFile(join(root, "theme.css"), ".slide .changed { display: block; }\n");
        expect(syncDeck(join(root, "decks", "demo")).dekFiles).toEqual({
          created: [],
          updated: [],
        });
        expect(await readFile(path, "utf8")).toBe(agents);
      },
    );
  });

  test("rewrites only dek's block in AGENTS.md and keeps the author's notes around it", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      const path = join(root, "AGENTS.md");
      await writeFile(path, "# Our team\n\nWrite in Japanese.\n");
      syncDeck(deckDir);
      const first = await readFile(path, "utf8");
      expect(first.startsWith("# Our team\n\nWrite in Japanese.\n\n<!-- dek:begin")).toBe(true);
      expect(first.endsWith("<!-- dek:end -->\n")).toBe(true);

      // An older dek's block, followed by notes the author added after it.
      const stale = first.replace("## Principles", "## An older dek's principles");
      await writeFile(path, `${stale}\n## After\n\nMore notes.\n`);
      syncDeck(deckDir);
      const second = await readFile(path, "utf8");
      expect(second).toBe(`${first}\n## After\n\nMore notes.\n`);
      expect(second.match(/<!-- dek:begin/g)).toHaveLength(1);
    });
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

describe("syncDeck and dek's own files", () => {
  const dekFiles = (root: string) => [
    join(root, ".dek", "schema.json"),
    join(root, ".dek", "slide.d.ts"),
    join(root, "AGENTS.md"),
  ];

  test("creates them the first time, and leaves them alone once they are current", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const dir = join(root, "decks", "demo");
      expect(syncDeck(dir).dekFiles).toEqual({ created: dekFiles(root), updated: [] });

      const old = new Date("2020-01-01T00:00:00Z");
      for (const path of dekFiles(root)) {
        await utimes(path, old, old);
      }
      expect(syncDeck(dir).dekFiles).toEqual({ created: [], updated: [] });
      for (const path of dekFiles(root)) {
        expect((await stat(path)).mtime).toEqual(old);
      }
    });
  });

  test("brings one that has drifted up to date, and says so", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const dir = join(root, "decks", "demo");
      syncDeck(dir);
      await writeFile(join(root, ".dek", "slide.d.ts"), "// an older dek's types\n");
      await writeFile(
        join(root, "AGENTS.md"),
        "<!-- dek:begin -->\nan older dek's block\n<!-- dek:end -->\n",
      );
      expect(syncDeck(dir).dekFiles).toEqual({
        created: [],
        updated: [join(root, ".dek", "slide.d.ts"), join(root, "AGENTS.md")],
      });
    });
  });
});

describe("syncDeck on a repository with hostile links", () => {
  test.each([".dek/schema.json", "AGENTS.md"])(
    "refuses a %s linked out of the project, leaving the file it points at",
    async (file) => {
      await withTempDir(async (outside) => {
        const victim = join(outside, `victim${extname(file)}`);
        await writeFile(victim, "mine");
        await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
          await mkdir(join(root, ".dek"), { recursive: true });
          await rm(join(root, file), { force: true });
          await symlink(victim, join(root, file));
          expect(() => syncDeck(join(root, "decks", "demo"))).toThrow("leads outside the project");
          expect(await readFile(victim, "utf8")).toBe("mine");
        });
      });
    },
  );

  test("writes through AGENTS.md linked to CLAUDE.md in the project", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      await writeFile(join(root, "CLAUDE.md"), "# notes\n");
      await rm(join(root, "AGENTS.md"), { force: true });
      await symlink("CLAUDE.md", join(root, "AGENTS.md"));
      syncDeck(join(root, "decks", "demo"));
      expect(await readFile(join(root, "CLAUDE.md"), "utf8")).toContain("<!-- dek:begin");
      expect((await lstat(join(root, "AGENTS.md"))).isSymbolicLink()).toBe(true);
    });
  });
});
