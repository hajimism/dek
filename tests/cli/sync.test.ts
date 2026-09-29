import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { outputOf } from "../../src/cli/commands.ts";
import { initCommand } from "../../src/cli/init.ts";
import { resolveDecks } from "../../src/cli/scope.ts";
import { syncCommand } from "../../src/cli/sync.ts";
import { lintDeck } from "../../src/core/lint.ts";
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
        const result = syncCommand(resolveDecks(root));
        expect(result.created.some((path) => path.endsWith("decks/alpha/slides/extra.html"))).toBe(
          true,
        );
        expect(result.created.some((path) => path.endsWith("decks/beta/slides/intro.html"))).toBe(
          true,
        );
      },
    );
  });

  test("lists dek's own files it updated, once however many decks it syncs", async () => {
    await withTempProject({ decks: [{ name: "alpha" }, { name: "beta" }] }, async (root) => {
      syncCommand(resolveDecks(root));
      await writeFile(join(root, ".dek", "slide.d.ts"), "// an older dek's types\n");
      const result = syncCommand(resolveDecks(root));
      expect(result.updated).toEqual([join(root, ".dek", "slide.d.ts")]);
    });
  });

  test("clears the example skeletons once the author writes their own script", async () => {
    await withTempDir(async (dir) => {
      initCommand({ cwd: dir, deck: "demo" });
      const deckDir = join(dir, "decks", "demo");
      await writeFile(join(deckDir, "script.md"), "---\ntitle: Mine\n---\n\n## hello\n");

      const result = syncCommand(resolveDecks(deckDir));
      expect(result.created).toEqual([join(deckDir, "slides", "hello.html")]);
      expect(result.removed.length).toBeGreaterThan(0);
      expect(listSlides(deckDir).map((slide) => slide.slug)).toEqual(["hello"]);
      expect(lintDeck(deckDir)).toEqual([]);
    });
  });
});

describe("dek sync and slides the script no longer names", () => {
  // Sync removes only what it wrote. A slide the author edited stays, and sync says so, so nobody
  // takes the silence for a clean deck.
  test("says which slides it kept though their section is gone", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n",
            slides: { intro: customIntro, old: customIntro },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const result = syncCommand(resolveDecks(deckDir));
        expect(result.kept).toEqual([join(deckDir, "slides", "old.html")]);
        expect(outputOf("sync").notes?.(result, false)).toBe(
          `kept ${join(deckDir, "slides", "old.html")}: its section is gone from script.md, and the file is yours\n  help: run \`dek lint\`, which names the \`dek mv\` if its section was renamed, or what else to do with it`,
        );
      },
    );
  });
});

describe("syncCommand and .gitignore", () => {
  test("adds the files dek keeps for itself to a .gitignore that lacks them, once", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const path = join(root, ".gitignore");
      await writeFile(path, "# mine\ndist/\n.dek/server.json");
      const first = syncCommand(resolveDecks(root));
      expect(first.updated).toContain(path);
      expect(await readFile(path, "utf8")).toBe(
        "# mine\ndist/\n.dek/server.json\n.dek/marks.json\n",
      );
      const second = syncCommand(resolveDecks(root));
      expect(second.updated).not.toContain(path);
    });
  });

  test("leaves a .gitignore alone that ignores them through .dek/", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const path = join(root, ".gitignore");
      await writeFile(path, "/.dek/\n");
      expect(syncCommand(resolveDecks(root)).updated).not.toContain(path);
      expect(await readFile(path, "utf8")).toBe("/.dek/\n");
    });
  });

  test("writes no .gitignore where the project has none", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      syncCommand(resolveDecks(root));
      expect(existsSync(join(root, ".gitignore"))).toBe(false);
    });
  });

  test("leaves a new project's .gitignore as init wrote it", async () => {
    await withTempDir(async (dir) => {
      initCommand({ cwd: dir, deck: "demo" });
      const path = join(dir, ".gitignore");
      const before = await readFile(path, "utf8");
      expect(syncCommand(resolveDecks(dir)).updated).not.toContain(path);
      expect(await readFile(path, "utf8")).toBe(before);
    });
  });
});
