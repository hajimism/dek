import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultTheme } from "../../src/cli/files.ts";
import { formatText } from "../../src/cli/result.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { themeCommand } from "../../src/cli/theme.ts";
import { cssClassNames, cssLayoutNames, parseCss } from "../../src/core/css.ts";
import { DekError } from "../../src/core/error.ts";
import { themeFacts } from "../../src/core/theme-facts.ts";

const themeLayouts = (css: string) => themeFacts(parseCss(css)).layouts;

import { withTempProject } from "../helpers/project.ts";

const repo = join(import.meta.dir, "..", "..");

const theme = `.slide {
  --fg: #fff;
  --gap: 2rem;
}

/* @layout split
<section class="slide" data-layout="split">
  <h2 class="slide-title">Title</h2>
  <p class="node">One</p>
</section>
*/
.slide[data-layout="split"] {
  display: grid;
}

.slide[data-layout="bare"] {
  display: block;
}

.slide .node {
  color: var(--fg);
}
`;

describe("themeLayouts", () => {
  test("pairs each layout with the example markup its @layout comment gives", () => {
    expect(themeLayouts(theme)).toEqual([
      { name: "bare" },
      {
        name: "split",
        example: `<section class="slide" data-layout="split">
  <h2 class="slide-title">Title</h2>
  <p class="node">One</p>
</section>`,
      },
    ]);
  });
});

describe("themeCommand", () => {
  test("reads the deck's own theme.css, not the project's", async () => {
    await withTempProject(
      { theme: ".slide .project-only { }\n", decks: [{ name: "demo", theme }] },
      async (root) => {
        const result = themeCommand(
          resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }),
        );
        expect(result.path).toBe(join(root, "decks", "demo", "theme.css"));
        expect(result.classes).toEqual(["node", "slide"]);
        expect(result.tokens).toEqual([
          { name: "--fg", value: "#fff" },
          { name: "--gap", value: "2rem" },
        ]);
        expect(result.layouts.map((layout) => layout.name)).toEqual(["bare", "split"]);
      },
    );
  });

  test("prints one layout's example markup, ready to paste", async () => {
    await withTempProject({ decks: [{ name: "demo", theme }] }, async (root) => {
      const result = themeCommand(
        resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }),
        "split",
      );
      expect(formatText({ command: "theme", data: result })).toBe(
        themeLayouts(theme).find((layout) => layout.name === "split")?.example ?? "",
      );
    });
  });

  test("says how to add an example when a layout has none", async () => {
    await withTempProject({ decks: [{ name: "demo", theme }] }, async (root) => {
      expect(() =>
        themeCommand(resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }), "bare"),
      ).toThrow(
        expect.objectContaining({
          message: 'layout "bare" has no example in theme.css',
          hint: 'add a /* @layout bare ... */ comment with its markup above .slide[data-layout="bare"]',
        }),
      );
    });
  });

  test("lists the layouts when the name is unknown", async () => {
    await withTempProject({ decks: [{ name: "demo", theme }] }, async (root) => {
      let error: unknown;
      try {
        themeCommand(resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }), "nope");
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(DekError);
      expect(error).toMatchObject({ hint: "use one of: bare, split" });
    });
  });
});

describe("the theme's tokens", () => {
  // A token set only on a view transition, or only inside one element, is no token a slide can
  // var(); both lists name the ones the bare .slide rule gives every slide.
  const tokenTheme = `.slide {
  --fg: #fff;
  --gap: 2rem;
}
.slide[data-layout="split"] { --gap: 3rem; }
.slide .card { --card-only: 1px; }
@media (min-width: 1px) { .slide { --wide-only: 1; } }
::view-transition-group(*) { --morph: 0.5s; }
`;

  test("dek theme lists the tokens the bare .slide rule gives every slide", async () => {
    await withTempProject({ decks: [{ name: "demo", theme: tokenTheme }] }, async (root) => {
      const result = themeCommand(
        resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }),
      );
      expect(result.tokens).toEqual([
        { name: "--fg", value: "#fff" },
        { name: "--gap", value: "2rem" },
      ]);
    });
  });
});

describe("bundled and sample themes", () => {
  const themes: Array<[string, string]> = [
    ["src/theme/default.css", defaultTheme()],
    ...["sample/theme.css", "sample/decks/why-dek/theme.css"].map((path): [string, string] => [
      path,
      readFileSync(join(repo, path), "utf8"),
    ]),
  ];

  for (const [path, css] of themes) {
    test(`${path}: every layout has an example that uses only its own classes`, () => {
      const classes = cssClassNames(parseCss(css));
      const layouts = themeLayouts(css);
      expect(layouts.map((layout) => layout.name)).toEqual(
        [...cssLayoutNames(parseCss(css))].sort(),
      );
      for (const layout of layouts) {
        expect({ name: layout.name, has: layout.example !== undefined }).toEqual({
          name: layout.name,
          has: true,
        });
        expect(layout.example).toContain(`data-layout="${layout.name}"`);
        const used = [...(layout.example ?? "").matchAll(/class="([^"]+)"/g)].flatMap((m) =>
          (m[1] ?? "").split(/\s+/),
        );
        expect(used.filter((name) => !classes.has(name))).toEqual([]);
      }
    });
  }
});
