import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { mvCommand } from "../../src/cli/mv.ts";
import { DekError } from "../../src/core/error.ts";
import { runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

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
  test("accepts a positional deck name from the project root", async () => {
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
        const result = await runDek(["mv", "demo", "architecture", "--before", "intro", "--json"], {
          cwd: root,
        });
        expect(result.exitCode).toBe(0);
        const script = await readFile(join(root, "decks", "demo", "script.md"), "utf8");
        expect(script.indexOf("## architecture")).toBeLessThan(script.indexOf("## intro"));
      },
    );
  });
});

describe("mvCommand", () => {
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
        expect(() => mvCommand({ cwd: root, slug: "architecture", before: "intro" })).toThrow(
          DekError,
        );

        const result = mvCommand({
          cwd: root,
          slug: "architecture",
          before: "intro",
          deck: "demo",
        });
        expect(result).toMatchObject({ from: "architecture", before: "intro" });
        const script = await readFile(join(root, "decks", "demo", "script.md"), "utf8");
        expect(script.indexOf("## architecture")).toBeLessThan(script.indexOf("## intro"));
        expect(existsSync(join(root, "decks", "demo", "slides", "intro.html"))).toBe(true);
      },
    );
  });
});
