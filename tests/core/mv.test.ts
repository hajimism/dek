import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import { renameSection } from "../../src/core/mv.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const problemHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">keep heading</h2>
</section>`);

describe("renameSection", () => {
  test("renames the id and HTML file without changing the heading text", async () => {
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
        renameSection(deckDir, "problem", "the-problem");
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

  test("does not rewrite script.md when the destination HTML already exists", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## problem

body
`,
            slides: { problem: problemHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const dest = join(deckDir, "slides", "the-problem.html");
        await writeFile(dest, problemHtml);
        const before = await readFile(join(deckDir, "script.md"), "utf8");
        try {
          renameSection(deckDir, "problem", "the-problem");
          throw new Error("expected renameSection to fail");
        } catch (error) {
          expect(error).toBeInstanceOf(DekError);
          expect((error as DekError).message).toContain('slide "the-problem" already exists');
        }
        expect(await readFile(join(deckDir, "script.md"), "utf8")).toBe(before);
        expect(existsSync(join(deckDir, "slides", "problem.html"))).toBe(true);
        expect(await readFile(dest, "utf8")).toBe(problemHtml);
      },
    );
  });
});
