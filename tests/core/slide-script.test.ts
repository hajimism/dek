import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { seekProblems } from "../../src/core/lint/slide-script.ts";
import { lintDeck, lintDeckAsync } from "../../src/core/lint.ts";
import { renameSection } from "../../src/core/mv.ts";
import { renderPdfHtml } from "../../src/core/pdf.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { stillDrawScript } from "../../src/core/slide-draw.ts";
import { readSlideScripts, slideScriptTags } from "../../src/core/slide-script.ts";
import { evaluateSlideScripts, slideScriptsProblems } from "../../src/core/slide-script-eval.ts";
import { loadSlideSources, renderSlideHtml } from "../../src/core/still-page.ts";
import { withTempDir } from "../helpers/fs.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

type Registry = Record<string, { motion?: Record<string, number>; draw?: unknown }>;

/**
 * A statement no other script has. Evaluations are cached by the transpiled code, which drops
 * comments, so only code keeps two scripts apart.
 */
function uniqueStatement(): string {
  return `const run = "${crypto.randomUUID()}";`;
}

/** What stops one script, as lint asks for many at once. */
function slideScriptProblems(code: string, options: { steps?: string[] } = {}): string[] {
  return (slideScriptsProblems([{ code, ...options }])[0] ?? []).map((problem) => problem.message);
}

/** Each script compiled as `slides/<slug>.ts` of a deck, in slug order, joined. */
async function compiled(scripts: Record<string, string>): Promise<string> {
  return withTempDir(async (root) => {
    const deckDir = join(root, "decks", "demo");
    for (const [slug, code] of Object.entries(scripts)) {
      await Bun.write(join(deckDir, "slides", `${slug}.ts`), code);
    }
    return readSlideScripts(deckDir, { strict: true })
      .map((script) => script.code)
      .join("");
  });
}

function run(snippet: string): Registry {
  const scope = {} as { __dekSlides?: Registry };
  new Function("window", snippet)(scope);
  return scope.__dekSlides ?? {};
}

describe("slideScriptProblems", () => {
  test("accepts a module with only a default export", () => {
    expect(slideScriptProblems("export default { draw() {} };")).toEqual([]);
  });

  test("rejects imports, named exports, and a missing default", () => {
    expect(slideScriptProblems('import gsap from "gsap";\nexport default {};')).toEqual([
      "imports are not supported; keep the slide script self-contained",
    ]);
    expect(slideScriptProblems("export const x = 1;\nexport default {};")).toEqual([
      'only a default export is allowed; found "x"',
    ]);
    expect(slideScriptProblems("const x = 1;")).toEqual(["missing export default"]);
  });

  test("reports a syntax error instead of throwing", () => {
    expect(slideScriptProblems("export default {")[0]).toMatch(/^syntax error/);
  });

  test("rejects top-level await, which a slide script cannot wait for", () => {
    expect(slideScriptProblems("const x = await 1;\nexport default {};")).toEqual([
      "top-level await is not supported; the slide script must finish when it loads",
    ]);
  });
});

describe("slideScriptProblems with the slide's beats", () => {
  const steps = { steps: ["0", "base", "growth"] };

  test("accepts motion keyed by the slide's beats", () => {
    expect(
      slideScriptProblems("export default { motion: { growth: 900 }, draw() {} };", steps),
    ).toEqual([]);
  });

  test("names a motion key that is not a beat of the slide", () => {
    expect(slideScriptProblems("export default { motion: { grwth: 900 } };", steps)).toEqual([
      'motion key "grwth" is not a beat of this slide',
    ]);
  });

  test("a numbered key only works for a beat without an id", () => {
    expect(slideScriptProblems("export default { motion: { 2: 900 } };", steps)).toEqual([
      'motion key "2" is not a beat of this slide',
    ]);
    expect(slideScriptProblems("export default { motion: { 1: 900 } };", { steps: ["1"] })).toEqual(
      [],
    );
  });

  test("still checks motion when the script has an import", () => {
    expect(
      slideScriptProblems(
        'import gsap from "gsap";\nexport default { motion: { grwth: 900 } };',
        steps,
      ),
    ).toEqual([
      "imports are not supported; keep the slide script self-contained",
      'motion key "grwth" is not a beat of this slide',
    ]);
  });

  test("does not blame the missing import's binding on the script", () => {
    expect(
      slideScriptProblems('import gsap from "gsap";\ngsap.init();\nexport default {};', steps),
    ).toEqual(["imports are not supported; keep the slide script self-contained"]);
  });

  test("motion values are non-negative milliseconds", () => {
    expect(
      slideScriptProblems('export default { motion: { base: "fast", growth: -1 } };', steps),
    ).toEqual([
      'motion "base" must be a non-negative number of milliseconds',
      'motion "growth" must be a non-negative number of milliseconds',
    ]);
  });

  test("the default export is an object whose draw is a function", () => {
    expect(slideScriptProblems("export default 42;", steps)).toEqual([
      "export default must be an object like { motion, draw }",
    ]);
    expect(slideScriptProblems("export default { draw: 1 };", steps)).toEqual([
      "draw must be a function",
    ]);
  });

  test("top-level code runs without Bun, process, or any host global", () => {
    const code = `const host = [typeof Bun, typeof process, typeof fetch, typeof setTimeout];
export default { motion: { base: host.every((t) => t === "undefined") ? 1 : -1 } };`;
    expect(slideScriptProblems(code, steps)).toEqual([]);
  });

  test("top-level code that never finishes is reported instead of hanging lint", () => {
    expect(slideScriptProblems("while (true) {}\nexport default {};", steps)).toEqual([
      "top-level code did not finish; touch the slide only inside draw",
    ]);
  });

  test("a promise that never settles its loop does not hang lint either", () => {
    expect(
      slideScriptProblems(
        "Promise.resolve().then(() => { while (true) {} });\nexport default {};",
        steps,
      ),
    ).toEqual([]);
  });

  test("top-level code that touches the page is reported", () => {
    expect(slideScriptProblems("const el = document.body;\nexport default {};", steps)[0]).toMatch(
      /^top-level code threw: .*document.*; touch the slide only inside draw$/,
    );
  });
});

describe("evaluateSlideScripts", () => {
  const steps = { steps: ["1"] };
  // Each test evaluates its own script: a cached one would skip the evaluation under test.
  const hang = () => `${uniqueStatement()}\nwhile (true) {}\nexport default { motion: { 1: 1 } };`;

  // Alone: a concurrent test's synchronous evaluation would hold the loop until this one is done.
  test.serial("evaluates without blocking the event loop", async () => {
    let ticked = false;
    const timer = setTimeout(() => {
      ticked = true;
    }, 20);
    const warming = evaluateSlideScripts([{ code: hang(), steps: ["1"] }]);
    expect(ticked).toBe(false);
    await warming;
    clearTimeout(timer);
    expect(ticked).toBe(true);
  });

  test("answers what the synchronous check does", async () => {
    const code = `${uniqueStatement()}\nexport default { motion: { 2: 1 } };`;
    expect(
      (await evaluateSlideScripts([{ code, ...steps }])).map((found) =>
        found.map((problem) => problem.message),
      ),
    ).toEqual([['motion key "2" is not a beat of this slide']]);
  });

  test("lets the synchronous check answer from the cache without a new evaluation", async () => {
    const code = hang();
    await evaluateSlideScripts([{ code, steps: ["1"] }]);
    const started = performance.now();
    expect(slideScriptProblems(code, steps)).toEqual([
      "top-level code did not finish; touch the slide only inside draw",
    ]);
    // A fresh evaluation waits out the sandbox's 1s timeout.
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe("compiled slide scripts", () => {
  test("registers the default export under the slug", async () => {
    const registry = run(
      await compiled({ usb: "const k = 2;\nexport default { motion: { growth: 600 * k } };" }),
    );
    expect(registry.usb?.motion).toEqual({ growth: 1200 });
  });

  test("keeps statements after the default export working", async () => {
    const registry = run(
      await compiled({
        usb: "export default { draw };\nfunction draw() { return helper; }\nconst helper = 1;",
      }),
    );
    expect(typeof registry.usb?.draw).toBe("function");
  });

  test("finds the real export default past comments and strings that mention it", async () => {
    const registry = run(
      await compiled({
        usb: "// export default comes last\nconst note = `\nexport default`;\nexport default { motion: { a: note.length } };",
      }),
    );
    expect(registry.usb?.motion).toEqual({ a: 15 });
  });

  test("an exported declaration keeps its name bound in the module", async () => {
    const registry = run(
      await compiled({
        usb: "export default class Chart { static motion = { a: Chart.name.length }; }",
      }),
    );
    expect(registry.usb?.motion).toEqual({ a: 5 });
  });

  test("keeps a </script> in a string from closing the page's script tag", async () => {
    const code = await compiled({ usb: 'export default { motion: { a: "</script>".length } };' });
    expect(code.toLowerCase()).not.toContain("</script");
    expect(run(code).usb?.motion).toEqual({ a: 9 });
  });

  test("two slides do not share top-level names", async () => {
    const registry = run(
      await compiled({
        one: "const k = 1; export default { motion: { a: k } };",
        two: "const k = 2; export default { motion: { a: k } };",
      }),
    );
    expect(registry.one?.motion?.a).toBe(1);
    expect(registry.two?.motion?.a).toBe(2);
  });
});

describe("readSlideScripts", () => {
  test("wraps every slides/<slug>.ts in the deck", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = `${root}/decks/demo`;
      await Bun.write(`${deckDir}/slides/intro.ts`, "export default { motion: { 1: 300 } };");
      const scripts = readSlideScripts(deckDir);
      expect(scripts.map((script) => script.slug)).toEqual(["intro"]);
      expect(run(scripts.map((script) => script.code).join("")).intro?.motion).toEqual({ 1: 300 });
    });
  });

  test("skips a broken script unless strict, where it fails with the file path", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = `${root}/decks/demo`;
      await Bun.write(`${deckDir}/slides/intro.ts`, 'import x from "x";\nexport default {};');
      expect(readSlideScripts(deckDir)).toEqual([]);
      expect(() => readSlideScripts(deckDir, { strict: true })).toThrow(
        expect.objectContaining({ name: "DekError", path: `${deckDir}/slides/intro.ts` }),
      );
    });
  });

  test("is empty when no slide has a script", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      expect(readSlideScripts(`${root}/decks/demo`)).toEqual([]);
    });
  });

  test("reads only the named slide when asked", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = `${root}/decks/demo`;
      await Bun.write(`${deckDir}/slides/intro.ts`, "export default {};");
      await Bun.write(`${deckDir}/slides/usb.ts`, 'import x from "x";\nexport default {};');
      expect(readSlideScripts(deckDir, { strict: true, only: "intro" }).map((s) => s.slug)).toEqual(
        ["intro"],
      );
    });
  });
});

describe("TypeScript slide scripts", () => {
  test("slides/<slug>.ts is compiled with its types erased", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = `${root}/decks/demo`;
      await Bun.write(
        `${deckDir}/slides/intro.ts`,
        'import type { Foo } from "./foo";\nconst ms: number = 300;\nexport default { motion: { 1: ms } } satisfies DekSlide;',
      );
      const scripts = readSlideScripts(deckDir, { strict: true });
      expect(scripts.map((script) => script.slug)).toEqual(["intro"]);
      expect(run(scripts.map((script) => script.code).join("")).intro?.motion).toEqual({ 1: 300 });
    });
  });

  test("a declaration file in slides/ is not a slide script", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(join(deckDir, "slides", "chart.d.ts"), "export {};");
      expect(readSlideScripts(deckDir, { strict: true })).toEqual([]);
      expect(lintDeck(deckDir).filter((d) => d.id === "DEK002" || d.id === "DEK016")).toEqual([]);
    });
  });

  test("DEK016: a .js file in slides/ is named, since slide scripts are .ts", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(join(deckDir, "slides", "chart.js"), "export default {};");
      const found = lintDeck(deckDir).filter((d) => d.id === "DEK016" || d.id === "DEK002");
      expect(found.map((d) => [d.id, d.message, d.path])).toEqual([
        [
          "DEK016",
          "slide scripts are TypeScript; rename chart.js to chart.ts",
          join(deckDir, "slides", "chart.js"),
        ],
      ]);
      expect(readSlideScripts(deckDir, { strict: true })).toEqual([]);
    });
  });

  test("DEK016: lint checks a .ts script's motion against the slide's beats", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(
        join(deckDir, "slides", "chart.ts"),
        "export default { motion: { grow: 900 as number } } satisfies DekSlide;",
      );
      const found = lintDeck(deckDir).filter((d) => d.id === "DEK016");
      expect(found.map((d) => d.message)).toEqual([
        'motion key "grow" is not a beat of this slide',
      ]);
    });
  });

  test("lintDeckAsync checks each script as it read it, whatever is saved meanwhile", async () => {
    await withTempProject(chartDeck, async (root) => {
      const path = join(root, "decks", "demo", "slides", "chart.ts");
      writeFileSync(path, `${uniqueStatement()}\nexport default { motion: { grow: 900 } };`);
      const linting = lintDeckAsync(join(root, "decks", "demo"));
      // A second read of the file would evaluate this one, on the event loop.
      writeFileSync(path, `${uniqueStatement()}\nwhile (true) {}\nexport default {};`);
      const found = (await linting).filter((d) => d.id === "DEK016");
      expect(found.map((d) => d.message)).toEqual([
        'motion key "grow" is not a beat of this slide',
      ]);
    });
  });

  // Alone: a concurrent test's synchronous evaluation would hold the loop until this one is done.
  test.serial("lintDeckAsync evaluates without blocking the event loop", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(
        join(deckDir, "slides", "chart.ts"),
        `${uniqueStatement()}\nwhile (true) {}\nexport default {};`,
      );
      let ticked = false;
      const timer = setTimeout(() => {
        ticked = true;
      }, 20);
      const linting = lintDeckAsync(deckDir);
      expect(ticked).toBe(false);
      const found = (await linting).filter((d) => d.id === "DEK016");
      clearTimeout(timer);
      expect(ticked).toBe(true);
      expect(found.map((d) => d.message)).toEqual([
        "top-level code did not finish; touch the slide only inside draw",
      ]);
    });
  });

  test("dekc mv moves a .ts script with its HTML", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(join(deckDir, "slides", "chart.ts"), "export default {};");
      renameSection(deckDir, "chart", "growth-chart");
      expect(await Bun.file(join(deckDir, "slides", "growth-chart.ts")).exists()).toBe(true);
    });
  });
});

describe("slideScriptTags", () => {
  test("gives each slide its own tag, so one that throws cannot stop the rest", () => {
    const tags = slideScriptTags([
      { slug: "one", path: "one.ts", code: "throw new Error('boom');" },
      { slug: "two", path: "two.ts", code: "window.ok = 1;" },
    ]);
    expect(tags).toBe(
      '<script data-dek-slides="one">throw new Error(\'boom\');</script><script data-dek-slides="two">window.ok = 1;</script>',
    );
  });
});

const chartScript = `---
title: Demo
---

## intro

hello

## chart

### base {#base}

first

### growth {#growth}

second
`;

const chartDeck = {
  decks: [
    {
      name: "demo",
      script: chartScript,
      slides: {
        intro: slideDocument(`<section class="slide"><h2>intro</h2></section>`),
        chart: slideDocument(`<section class="slide"><p class="bar"></p></section>`),
      },
    },
  ],
};

describe("still pages run slide scripts", () => {
  test("a shot page marks its beat and carries the scripts", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(join(deckDir, "slides", "chart.ts"), "export default { draw() {} };");
      const { deck } = resolveDeck(deckDir);
      const html = renderSlideHtml(loadSlideSources(deck), "chart", 2);
      expect(html).toContain('data-dek-beat="2"');
      expect(html).toContain('data-dek-step="growth"');
      expect(html).toContain('__dekSlides ||= {})["chart"]');
      expect(html).toContain(stillDrawScript());
    });
  });

  test("the PDF marks every slide at its last beat", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(join(deckDir, "slides", "chart.ts"), "export default { draw() {} };");
      const html = renderPdfHtml(resolveDeck(deckDir).deck);
      expect(html).toContain('data-dek-beat="2" data-dek-step="growth"');
      expect(html).toContain(stillDrawScript());
    });
  });

  test("a shot page carries only its own slide's script", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(join(deckDir, "slides", "chart.ts"), "export default { draw() {} };");
      await Bun.write(
        join(deckDir, "slides", "intro.ts"),
        'import x from "x";\nexport default {};',
      );
      const { deck } = resolveDeck(deckDir);
      const html = renderSlideHtml(loadSlideSources(deck), "chart", 1);
      expect(html).toContain('data-dek-slides="chart"');
      expect(html).not.toContain('"intro"');
    });
  });

  test("a shot page takes its script from the sources, read once per run", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      const scriptPath = join(deckDir, "slides", "chart.ts");
      await Bun.write(scriptPath, 'export default { draw() { return "first"; } };');
      const { deck } = resolveDeck(deckDir);
      const sources = loadSlideSources(deck);
      await Bun.write(scriptPath, 'export default { draw() { return "second"; } };');
      const html = renderSlideHtml(sources, "chart", 1);
      expect(html).toContain('"first"');
      expect(html).not.toContain('"second"');
    });
  });

  test("a broken script fails its own shot, unless the sources are lenient", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(
        join(deckDir, "slides", "chart.ts"),
        'import x from "x";\nexport default {};',
      );
      const { deck } = resolveDeck(deckDir);
      expect(() => renderSlideHtml(loadSlideSources(deck), "chart", 2)).toThrow(
        'invalid slide script "chart"',
      );
      const html = renderSlideHtml(loadSlideSources(deck, { strict: false }), "chart", 2);
      expect(html).not.toContain("data-dek-slides");
      expect(html).toContain('data-dek-step="growth"');
    });
  });

  test("a deck without slide scripts still ends the theme's animations on its stills", async () => {
    await withTempProject(chartDeck, async (root) => {
      const { deck } = resolveDeck(join(root, "decks", "demo"));
      for (const html of [
        renderSlideHtml(loadSlideSources(deck), "chart", 1),
        renderPdfHtml(deck),
      ]) {
        expect(html).not.toContain("data-dek-slides");
        expect(html).toContain(stillDrawScript());
      }
    });
  });
});

describe("slide script lint and mv", () => {
  test("DEK017: a clock or a class lookup in a slide script is an error on its line", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(
        join(deckDir, "slides", "chart.ts"),
        'export default {\n  draw(slide) {\n    setTimeout(() => {}, 1);\n    slide.querySelector(".bar");\n  },\n};\n',
      );
      const found = lintDeck(deckDir).filter((d) => d.id === "DEK017");
      expect(found.map((d) => [d.line, d.slug, d.path])).toEqual([
        [3, "chart", join(deckDir, "slides", "chart.ts")],
        [4, "chart", join(deckDir, "slides", "chart.ts")],
      ]);
      expect(found[1]?.data).toEqual({ class: "bar" });
    });
  });

  test("DEK016: a slide script that cannot run is reported against its file", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(
        join(deckDir, "slides", "chart.ts"),
        'import x from "x";\nexport default {};',
      );
      const found = lintDeck(deckDir).filter((d) => d.id === "DEK016");
      expect(found).toHaveLength(1);
      expect(found[0]?.path).toBe(join(deckDir, "slides", "chart.ts"));
      expect(found[0]?.message).toContain("imports are not supported");
    });
  });

  // Each problem says where it is and what to do: the line when the source has one, and a hint.
  test("DEK016: gives each problem its line and a hint", async () => {
    const cases: Array<[string, { message: string; line?: number; hint: string }]> = [
      [
        "export default {\n  draw(slide) {\n    const x = ;\n  },\n};",
        {
          message: "syntax error: Unexpected ;",
          line: 3,
          hint: "fix the syntax there; until the script parses, the slide shows without it",
        },
      ],
      [
        "export default { draw( };",
        {
          message: 'syntax error: Expected identifier but found "}"',
          line: 1,
          hint: "fix the syntax there; until the script parses, the slide shows without it",
        },
      ],
      [
        'const a = 1;\nimport x from "x";\nexport default {};',
        {
          message: "imports are not supported; keep the slide script self-contained",
          line: 2,
          hint: "remove the import and write what it gave in this file; DekSlide is global, from .dek/slide.d.ts",
        },
      ],
      [
        "export const x = 1;\nexport default {};",
        {
          message: 'only a default export is allowed; found "x"',
          line: 1,
          hint: 'drop export from "x", or make it part of the default export',
        },
      ],
      [
        "const x = 1;",
        {
          message: "missing export default",
          hint: "end the script with export default { draw(slide, { t }) {} } satisfies DekSlide",
        },
      ],
      [
        "export default {\n  motion: {\n    grow: 900,\n  },\n};",
        {
          message: 'motion key "grow" is not a beat of this slide',
          line: 3,
          hint: 'did you mean "growth"? use one of: 0, base, growth',
        },
      ],
    ];
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      for (const [code, expected] of cases) {
        await Bun.write(join(deckDir, "slides", "chart.ts"), `${code}\n// ${uniqueStatement()}`);
        const found = lintDeck(deckDir).filter((d) => d.id === "DEK016");
        expect(found.map(({ message, line, hint }) => ({ message, line, hint }))).toEqual([
          { line: undefined, ...expected },
        ]);
      }
    });
  });

  test("DEK016: a motion key is checked against the slide's own beats", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(
        join(deckDir, "slides", "chart.ts"),
        "export default { motion: { growht: 900 }, draw() {} };",
      );
      const found = lintDeck(deckDir).filter((d) => d.id === "DEK016");
      expect(found.map((d) => d.message)).toEqual([
        'motion key "growht" is not a beat of this slide',
      ]);
    });
  });

  test("DEK002: a slide script with no section is reported", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(join(deckDir, "slides", "gone.ts"), "export default {};");
      const found = lintDeck(deckDir).filter((d) => d.id === "DEK002");
      expect(found.map((d) => d.path)).toEqual([join(deckDir, "slides", "gone.ts")]);
    });
  });

  test("dekc mv moves the slide's script with its HTML", async () => {
    await withTempProject(chartDeck, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await Bun.write(join(deckDir, "slides", "chart.ts"), "export default {};");
      renameSection(deckDir, "chart", "growth-chart");
      expect(await Bun.file(join(deckDir, "slides", "growth-chart.ts")).exists()).toBe(true);
      expect(await Bun.file(join(deckDir, "slides", "chart.ts")).exists()).toBe(false);
    });
  });
});

describe("seekProblems", () => {
  test("accepts a script that draws from t and finds elements by data-*", () => {
    expect(
      seekProblems(`export default {
  draw(slide, { t }) {
    // setTimeout would break seeking; so would querySelector(".x")
    for (const el of slide.querySelectorAll("[data-count]")) el.textContent = String(t);
  },
};`),
    ).toEqual([]);
  });

  test("names each clock, timer, and random source with its line", () => {
    expect(
      seekProblems(`export default {
  draw(slide, { t }) {
    setTimeout(() => {}, 10);
    const now = Date.now() + performance.now();
    requestAnimationFrame(() => {});
    slide.dataset.seed = String(Math.random() + new Date().getTime());
  },
};`).map(({ line, message }) => ({ line, message })),
    ).toEqual([
      {
        line: 3,
        message:
          "setTimeout runs on its own clock; draw from t alone so video and screenshots can seek it",
      },
      {
        line: 4,
        message:
          "Date.now runs on its own clock; draw from t alone so video and screenshots can seek it",
      },
      {
        line: 4,
        message:
          "performance.now runs on its own clock; draw from t alone so video and screenshots can seek it",
      },
      {
        line: 5,
        message:
          "requestAnimationFrame runs on its own clock; draw from t alone so video and screenshots can seek it",
      },
      {
        line: 6,
        message: "Math.random differs on every call; derive the value from t or the slide's beats",
      },
      {
        line: 6,
        message:
          "new Date runs on its own clock; draw from t alone so video and screenshots can seek it",
      },
    ]);
  });

  // Shots and the still pages hold one slide, so document.querySelector finds the right element
  // there; the built deck holds every slide, and the same call reaches into another.
  test("names a reach past the slide into the document", () => {
    expect(
      seekProblems(`export default {
  draw(slide) {
    document.querySelector("[data-bar]").style.width = "1px";
    document.getElementById("chart");
    document.body.dataset.mode = "dark";
  },
};`).map(({ line, message, data }) => ({ line, message, data })),
    ).toEqual([
      {
        line: 3,
        message:
          "document.querySelector reaches every slide in the deck; find elements from the slide draw is given, as slide.querySelector",
        data: { call: "document.querySelector" },
      },
      {
        line: 4,
        message:
          "document.getElementById reaches every slide in the deck; find elements from the slide draw is given, as slide.querySelector",
        data: { call: "document.getElementById" },
      },
      {
        line: 5,
        message:
          "document.body reaches every slide in the deck; find elements from the slide draw is given, as slide.querySelector",
        data: { call: "document.body" },
      },
    ]);
  });

  test("names a class used to find an element", () => {
    expect(
      seekProblems(`export default {
  draw(slide) {
    slide.querySelector(".big");
    slide.querySelectorAll("li.item");
    slide.getElementsByClassName("big");
    slide.querySelector("[data-x]").closest(".row");
  },
};`).map((problem) => problem.line),
    ).toEqual([3, 4, 5, 6]);
    expect(
      seekProblems('export default { draw(s) { s.querySelector(".big"); } };')[0]?.message,
    ).toBe('finds elements by class ".big"; give the element a data-* attribute and select that');
  });
});
