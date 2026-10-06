import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { annotationsCommand, clearAnnotationsCommand } from "../../src/cli/annotations.ts";
import { displayPaths, formatText } from "../../src/cli/result.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { applyAnnotationOp } from "../../src/core/annotations.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempProject } from "../helpers/project.ts";

const script = `---
title: Plan
lang: en
---

## plan

### base {#base}

one
`;

const plan = `<section class="slide">
  <div class="lane">
    <div class="chevron">画面 <b>設計</b></div>
    <div class="arrow"></div>
  </div>
</section>
`;

const spec = { decks: [{ name: "demo", script, slides: { plan } }] };
const box = { x: 10, y: 20, width: 30, height: 40 };

/** Notes as annotate mode leaves them: one on the arrow, one on the arrow and the chevron. */
function annotate(root: string): void {
  const { deck } = resolveDeck(join(root, "decks", "demo"));
  const add = (sources: string[], text: string) =>
    applyAnnotationOp(root, deck, {
      op: "add",
      slug: "plan",
      step: "base",
      text,
      targets: sources.map((source) => ({ source, box })),
    });
  add(["4:5"], "make it pink");
  add(["3:5", "4:5"], "line these up");
}

const target = (root: string) => resolveTarget(join(root, "decks", "demo"), "deck", {});

describe("dekc annotations", () => {
  test("lists each note with where its elements are, and says once the slide changed", async () => {
    await withTempProject(spec, async (root) => {
      annotate(root);
      await writeFile(
        join(root, "decks", "demo", "slides", "plan.html"),
        plan.replace("画面 <b>設計</b>", "画面 <b>実装</b>"),
      );
      const result = await runDek(["annotations", "demo", "--json"], { cwd: root });
      expect(result.exitCode).toBe(0);
      expect(jsonStdout(result)).toMatchObject({
        ok: true,
        action: "list",
        annotations: [
          {
            number: 1,
            status: "edited",
            text: "make it pink",
            targets: [
              {
                path: "decks/demo/slides/plan.html",
                line: 4,
                column: 5,
                found: true,
                name: "div.arrow",
              },
            ],
            changed: ["decks/demo/slides/plan.html"],
            shot: "dekc shot demo plan --step base",
          },
          {
            number: 2,
            targets: [
              { name: "div.chevron", was: "画面 設計", text: "画面 実装" },
              { name: "div.arrow" },
            ],
          },
        ],
      });
    });
  });

  test("prints each note with its elements at their lines and the shot that shows it", async () => {
    await withTempProject(spec, async (root) => {
      annotate(root);
      await writeFile(
        join(root, "decks", "demo", "slides", "plan.html"),
        plan
          .replace("画面 <b>設計</b>", "画面 <b>実装</b>")
          .replace('    <div class="arrow"></div>\n', ""),
      );
      const data = await annotationsCommand(target(root));
      expect(
        formatText(displayPaths({ command: "annotations", data }, join(root, "decks", "demo"))),
      ).toBe(
        [
          "1  plan › base (gone)",
          "   slides/plan.html:4:5  div.arrow (not found)",
          "   > make it pink",
          "   dekc shot demo plan --step base",
          "2  plan › base (edited)",
          '   slides/plan.html:3:5  div.chevron "画面 実装" (was "画面 設計")',
          "   slides/plan.html:4:5  div.arrow (not found)",
          "   > line these up",
          "   dekc shot demo plan --step base",
        ].join("\n"),
      );
    });
  });

  test("says when there are none, and how a human leaves one", async () => {
    await withTempProject(spec, async (root) => {
      const data = await annotationsCommand(target(root));
      expect(formatText({ command: "annotations", data })).toBe(
        "no annotations: press a on the dev server's page to point at an element and write a note",
      );
    });
  });

  test("clear drops the deck's notes and says how many", async () => {
    await withTempProject(spec, async (root) => {
      annotate(root);
      const cleared = await clearAnnotationsCommand(target(root));
      expect(cleared).toEqual({ action: "clear", cleared: 2 });
      expect(formatText({ command: "annotations", data: cleared })).toBe("cleared 2 annotations");
      expect(await annotationsCommand(target(root))).toEqual({ action: "list", annotations: [] });
    });
  });
});
