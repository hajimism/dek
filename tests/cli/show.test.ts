import { describe, expect, test } from "bun:test";
import { rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatText } from "../../src/cli/result.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { showCommand } from "../../src/cli/show.ts";
import { jsonStdout, runDekc } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

type ShowOk = {
  ok: true;
  slug: string;
  title: string;
  script: string;
  html: string | null;
  css: string | null;
  ts: string | null;
  theme: string | null;
  assets: string[];
};

describe("dekc show", () => {
  test("returns the section script and HTML", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = await runDekc(["show", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
        });
        expect(result).toMatchObject({ exitCode: 0 });
        const json = jsonStdout<ShowOk>(result);
        expect(json.ok).toBe(true);
        expect(json.slug).toBe("intro");
        expect(json.title).toBe("intro");
        expect(json.script).toContain("hello");
        expect(json.html).toContain("<section");
        expect(json.html).toContain("intro");
      },
    );
  });
});

describe("showCommand", () => {
  test("gives the section as script.md has it, and its beats to bind data-step to", async () => {
    const script = `---
title: Demo
---

## 結果 {#results}

数字を三つ見ます。

### ヒット率 {#hit}

ヒット率は 94% です。

### 最後に

p99 は 120ms。

## まとめ {#end}

以上です。
`;
    await withTempProject({ decks: [{ name: "demo", script }] }, async (root) => {
      const result = showCommand(
        resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }),
        "results",
      );
      expect(result.script).toBe(`## 結果 {#results}

数字を三つ見ます。

### ヒット率 {#hit}

ヒット率は 94% です。

### 最後に

p99 は 120ms。
`);
      expect(result.beats).toEqual([
        { id: "hit", title: "ヒット率", line: 9 },
        { title: "最後に", line: 13 },
      ]);
      const last = showCommand(
        resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }),
        "end",
      );
      expect(last.script).toBe("## まとめ {#end}\n\n以上です。\n");
      expect(last.beats).toEqual([]);
    });
  });

  test("accepts a named deck from the project root", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", slides: { intro: introHtml } },
          { name: "beta", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const result = showCommand(
          resolveTarget(root, "deck", { refs: true, deck: "beta" }),
          "intro",
        );
        expect(result.slug).toBe("intro");
      },
    );
  });

  test("returns html null when the slide file is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = showCommand(
        resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }),
        "intro",
      );
      expect(result.slug).toBe("intro");
      expect(result.script).toContain("hello");
      expect(result.html).toBeNull();
    });
  });
});

describe("showCommand and links", () => {
  // What show prints is what a build would publish; a link out of the project is neither.
  test.each(["slides/intro.html", "slides/intro.css", "slides/intro.ts", "theme.css"])(
    "refuses a %s that links out of the project, as the build does",
    async (file) => {
      await withTempDir(async (outside) => {
        const secret = join(outside, "secret.css");
        await writeFile(secret, "SECRET_TOKEN=ghp_1234");
        await withTempProject(
          { decks: [{ name: "demo", slides: { intro: introHtml } }] },
          async (root) => {
            const deckDir = join(root, "decks", "demo");
            await rm(join(deckDir, file), { force: true });
            await symlink(secret, join(deckDir, file));
            expect(() =>
              showCommand(resolveTarget(deckDir, "deck", { refs: true }), "intro"),
            ).toThrow("leads outside the project");
          },
        );
      });
    },
  );
});

describe("show as a reading entry point", () => {
  const theme = `.slide { --fg: #111; --bg: #fff; color: var(--fg); }
.slide .card { padding: 0; }
.slide .tag { color: red; }
.slide[data-layout="title"] { place-items: center; }
.slide[data-layout="split"] { display: grid; }
`;
  const cardHtml = slideDocument(`<section class="slide" data-layout="title">
  <div class="card mine"><img src="assets/chart.png" alt=""><img src="assets/gone.png" alt=""></div>
</section>`);

  const spec = {
    decks: [
      {
        name: "demo",
        theme,
        slides: { intro: cardHtml },
        styles: {
          intro: '.slide .mine { color: var(--bg); background: url("../assets/bg.svg"); }',
        },
        scripts: { intro: "export default { draw() {} } satisfies DekcSlide;\n" },
        assets: { "chart.png": "png", "bg.svg": "<svg/>", "unused.png": "png" },
      },
    ],
  };

  test("returns the slide's stylesheet, motion module, theme excerpt, and assets", async () => {
    await withTempProject(spec, async (root) => {
      const result = showCommand(
        resolveTarget(root, "deck", { refs: true, deck: "demo" }),
        "intro",
      );
      expect(result.css).toContain(".slide .mine");
      expect(result.ts).toContain("satisfies DekcSlide");
      expect(result.theme).toContain(".slide .card {");
      expect(result.theme).toContain('.slide[data-layout="title"] {');
      expect(result.theme).toContain("--bg: #fff;");
      expect(result.theme).not.toContain(".slide .tag");
      expect(result.theme).not.toContain('data-layout="split"');
      expect(result.assets).toEqual(["assets/bg.svg", "assets/chart.png"]);
    });
  });

  test("returns null for the files a slide does not have", async () => {
    await withTempProject({ decks: [{ name: "demo", theme: null }] }, async (root) => {
      const result = showCommand(
        resolveTarget(join(root, "decks", "demo"), "deck", { refs: true }),
        "intro",
      );
      expect(result.css).toBeNull();
      expect(result.ts).toBeNull();
      expect(result.theme).toBeNull();
      expect(result.assets).toEqual([]);
    });
  });

  test("labels each part with the file it comes from in text output", async () => {
    await withTempProject(spec, async (root) => {
      const out = formatText({
        command: "show",
        data: showCommand(resolveTarget(root, "deck", { refs: true, deck: "demo" }), "intro"),
      });
      const order = [
        "--- script.md",
        "--- slides/intro.html",
        "--- slides/intro.css",
        "--- slides/intro.ts",
        "--- theme.css (the rules this slide uses)",
        "--- assets",
      ].map((label) => out.indexOf(label));
      expect(order.every((index) => index >= 0)).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      expect(out).toContain("assets/chart.png");
    });
  });
});
