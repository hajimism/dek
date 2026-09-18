import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const problemHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">keep heading</h2>
</section>`);

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const architectureHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">architecture</h2>
</section>`);

const twoSectionScript = `---
title: Demo
---

## intro

hello

## architecture

body
`;

describe("dek mv", () => {
  test("renames a section id and its HTML file, leaving the heading text", async () => {
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
`,
            slides: { problem: problemHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const result = await runDek(["mv", "problem", "the-problem", "--json"], { cwd: deckDir });
        expect(result.exitCode).toBe(0);
        expect(jsonStdout(result)).toMatchObject({ ok: true });

        const script = await readFile(join(deckDir, "script.md"), "utf8");
        expect(script).toContain("## 発表の前日に何をしていますか {#the-problem}");
        expect(script).not.toContain("{#problem}");
        expect(existsSync(join(deckDir, "slides", "problem.html"))).toBe(false);
        expect(await readFile(join(deckDir, "slides", "the-problem.html"), "utf8")).toBe(
          problemHtml,
        );
      },
    );
  });

  test("moves a section before another without renaming HTML", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: twoSectionScript,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const result = await runDek(["mv", "architecture", "--before", "intro", "--json"], {
          cwd: deckDir,
        });
        expect(result.exitCode).toBe(0);

        const script = await readFile(join(deckDir, "script.md"), "utf8");
        expect(script.indexOf("## architecture")).toBeLessThan(script.indexOf("## intro"));
        expect(existsSync(join(deckDir, "slides", "intro.html"))).toBe(true);
        expect(existsSync(join(deckDir, "slides", "architecture.html"))).toBe(true);
      },
    );
  });

  test("moves a section after another", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## architecture

body

## intro

hello
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const result = await runDek(["mv", "architecture", "--after", "intro", "--json"], {
          cwd: deckDir,
        });
        expect(result.exitCode).toBe(0);

        const script = await readFile(join(deckDir, "script.md"), "utf8");
        expect(script.indexOf("## intro")).toBeLessThan(script.indexOf("## architecture"));
      },
    );
  });

  test("requires --deck when run from the project root", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: twoSectionScript,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const missing = await runDek(["mv", "architecture", "--before", "intro", "--json"], {
          cwd: root,
        });
        expect(missing.exitCode).toBe(1);

        const result = await runDek(
          ["mv", "architecture", "--before", "intro", "--deck", "demo", "--json"],
          { cwd: root },
        );
        expect(result.exitCode).toBe(0);
        const script = await readFile(join(root, "decks", "demo", "script.md"), "utf8");
        expect(script.indexOf("## architecture")).toBeLessThan(script.indexOf("## intro"));
      },
    );
  });
});
