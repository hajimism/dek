import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initCommand } from "../../src/cli/init.ts";
import { syncCommand } from "../../src/cli/sync.ts";
import { lintDeck } from "../../src/core/index.ts";
import { listSlides } from "../../src/core/resolve.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";
import { extractSlide } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

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

type SyncOk = {
  ok: true;
  created: string[];
};

describe("dek sync", () => {
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
        const result = await runDek(["sync", "--json"], { cwd: deckDir });
        expect(result).toMatchObject({ exitCode: 0 });

        const json = jsonStdout<SyncOk>(result);
        expect(json.ok).toBe(true);
        expect(json.created.some((path) => path.endsWith("slides/extra.html"))).toBe(true);
        expect(await readFile(join(deckDir, "slides", "intro.html"), "utf8")).toBe(customIntro);

        const extra = await readFile(join(deckDir, "slides", "extra.html"), "utf8");
        expect(extra).not.toContain("<!DOCTYPE html>");
        expect(extra.trimStart().startsWith('<section class="slide"')).toBe(true);
        expect(extractSlide(extra)).toContain('data-layout="title"');
        expect(existsSync(join(root, ".dek", "schema.json"))).toBe(true);
      },
    );
  });
});

describe("syncCommand", () => {
  test("syncs every deck from the project root", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "alpha",
            script: `---
title: Alpha
---

## intro

hello

## extra {#extra}

more
`,
            slides: { intro: customIntro },
          },
          { name: "beta" },
        ],
      },
      async (root) => {
        const result = syncCommand({ cwd: root });
        expect(result.created.some((path) => path.endsWith("decks/alpha/slides/extra.html"))).toBe(
          true,
        );
        expect(result.created.some((path) => path.endsWith("decks/beta/slides/intro.html"))).toBe(
          true,
        );
      },
    );
  });

  test("clears the example skeletons once the author writes their own script", async () => {
    await withTempDir(async (dir) => {
      initCommand({ cwd: dir, deck: "demo" });
      const deckDir = join(dir, "decks", "demo");
      await writeFile(join(deckDir, "script.md"), "---\ntitle: Mine\n---\n\n## hello\n");

      const result = syncCommand({ cwd: deckDir });
      expect(result.created).toEqual([join(deckDir, "slides", "hello.html")]);
      expect(result.removed.length).toBeGreaterThan(0);
      expect(listSlides(deckDir).map((slide) => slide.slug)).toEqual(["hello"]);
      expect(lintDeck(deckDir)).toEqual([]);
    });
  });
});
