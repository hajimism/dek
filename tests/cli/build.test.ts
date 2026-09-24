import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { buildCommand } from "../../src/cli/build.ts";
import { defaultTheme } from "../../src/cli/files.ts";
import { formatText } from "../../src/cli/result.ts";
import { DekError } from "../../src/core/error.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

type BuildOk = {
  ok: true;
  out: string;
};

describe("buildCommand and lint", () => {
  test("builds a deck that fails lint, and says so", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: defaultTheme(),
            slides: {
              intro: slideDocument(`<section class="slide"><h2 class="nope">intro</h2></section>`),
            },
          },
        ],
      },
      async (root) => {
        const result = await buildCommand({ cwd: join(root, "decks", "demo") });
        expect("out" in result && result.out).toBe(
          join(root, "decks", "demo", "dist", "demo.html"),
        );
        expect(result.diagnostics.map((d) => d.id)).toEqual(["DEK010"]);
        expect(formatText({ command: "build", data: result })).toBe(
          `wrote ${join(root, "decks", "demo", "dist", "demo.html")}\nlint: 1 error; run \`dek lint\` to see it`,
        );
      },
    );
  });

  test("says nothing about lint when the deck is clean", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", theme: defaultTheme(), slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = await buildCommand({ cwd: join(root, "decks", "demo") });
        expect(result.diagnostics).toEqual([]);
        expect(formatText({ command: "build", data: result })).not.toContain("lint");
      },
    );
  });
});

describe("dek build", () => {
  test("writes project dist/<deck>.html with --root-dist", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: ".slide { width: 1280px; }\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = await runDek(["build", "--json", "--root-dist"], {
          cwd: join(root, "decks", "demo"),
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<BuildOk>(result);
        expect(json.ok).toBe(true);
        expect(json.out).toBe(join(root, "dist", "demo.html"));
      },
    );
  });
});

describe("buildCommand", () => {
  test("writes dist/<deck>.html", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: ".slide { width: 1280px; }\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = await buildCommand({ cwd: join(root, "decks", "demo") });
        expect("out" in result && result.out).toBe(
          join(root, "decks", "demo", "dist", "demo.html"),
        );
      },
    );
  });

  test("builds every deck from the project root", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
          { name: "beta", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const result = await buildCommand({ cwd: root });
        expect("outs" in result && result.outs).toEqual([
          join(root, "decks", "alpha", "dist", "alpha.html"),
          join(root, "decks", "beta", "dist", "beta.html"),
        ]);
        if ("outs" in result) {
          expect(await Bun.file(result.outs[0] ?? "").exists()).toBe(true);
          expect(await Bun.file(result.outs[1] ?? "").exists()).toBe(true);
        }
      },
    );
  });

  test("builds one deck from a named deck", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
          { name: "beta", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const result = await buildCommand({ cwd: root, deck: "beta" });
        expect("out" in result && result.out).toBe(
          join(root, "decks", "beta", "dist", "beta.html"),
        );
        if ("out" in result) {
          expect(await Bun.file(result.out).exists()).toBe(true);
        }
        expect(await Bun.file(join(root, "decks", "alpha", "dist", "alpha.html")).exists()).toBe(
          false,
        );
      },
    );
  });

  test("writes every deck into project dist with rootDist", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
          { name: "beta", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const result = await buildCommand({ cwd: root, rootDist: true });
        expect("outs" in result && result.outs).toEqual([
          join(root, "dist", "alpha.html"),
          join(root, "dist", "beta.html"),
        ]);
        if ("outs" in result) {
          expect(await Bun.file(result.outs[0] ?? "").exists()).toBe(true);
          expect(await Bun.file(result.outs[1] ?? "").exists()).toBe(true);
        }
      },
    );
  });

  test("fails when a section has no slide HTML", async () => {
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
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        await expect(buildCommand({ cwd: join(root, "decks", "demo") })).rejects.toMatchObject({
          name: "DekError",
          hint: expect.stringContaining("dek sync"),
        });
        try {
          await buildCommand({ cwd: join(root, "decks", "demo") });
        } catch (error) {
          expect(error).toBeInstanceOf(DekError);
        }
      },
    );
  });
});
