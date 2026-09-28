import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildCommand } from "../../src/cli/build.ts";
import { COMMANDS } from "../../src/cli/commands.ts";
import { defaultTheme } from "../../src/cli/files.ts";
import { parseCommandLine } from "../../src/cli/flags.ts";
import { formatText } from "../../src/cli/result.ts";
import { resolveDecks } from "../../src/cli/scope.ts";
import { PLAYWRIGHT_INSTALL, type VisualRequest } from "../../src/core/playwright.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { writeRequested } from "../helpers/visual.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

type BuildOk = {
  ok: true;
  outs: string[];
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
        const result = await buildCommand(resolveDecks(join(root, "decks", "demo")));
        expect(result.outs).toEqual([join(root, "decks", "demo", "dist", "demo.html")]);
        expect(result.diagnostics.map((d) => d.id)).toEqual(["DEK010"]);
        expect(formatText({ command: "build", data: result })).toBe(
          [
            `wrote ${join(root, "decks", "demo", "dist", "demo.html")}`,
            "lint: 1 error from dek's rules; run `dek lint` to see it",
          ].join("\n"),
        );
      },
    );
  });

  test("reports a dek.toml finding once, however many decks it builds", async () => {
    await withTempProject(
      {
        toml: "bogus = 1\n",
        decks: [
          { name: "alpha", theme: defaultTheme(), slides: { intro: introHtml } },
          { name: "beta", theme: defaultTheme(), slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const result = await buildCommand(resolveDecks(root));
        expect(result.diagnostics.map((d) => [d.id, d.path])).toEqual([
          ["DEK008", join(root, "dek.toml")],
        ]);
      },
    );
  });

  test("says nothing about lint when the deck is clean", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", theme: defaultTheme(), slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = await buildCommand(resolveDecks(join(root, "decks", "demo")));
        expect(result.diagnostics).toEqual([]);
        expect(formatText({ command: "build", data: result })).not.toContain("lint");
      },
    );
  });
});

describe("buildCommand and a slide script that cannot run", () => {
  // Lint never stops a build: the slide is built without its motion, and the build says why.
  test("builds the deck without the script, and names the problem", async () => {
    await withTempProject(
      { decks: [{ name: "demo", theme: defaultTheme(), slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        await Bun.write(
          join(deckDir, "slides", "intro.ts"),
          'import x from "x";\nexport default {};',
        );
        const result = await buildCommand(resolveDecks(deckDir));
        expect(result.outs).toEqual([join(deckDir, "dist", "demo.html")]);
        expect(result.diagnostics.map((d) => d.id)).toContain("DEK016");
        // Built without the script: nothing registers a module for the slide.
        expect(await Bun.file(join(deckDir, "dist", "demo.html")).text()).not.toContain(
          '{})["intro"] = (',
        );
      },
    );
  });
});

describe("buildCommand link preview", () => {
  const fakeRunner = async (request: VisualRequest) => {
    await writeRequested(request, "png");
    return { overflows: [], contrasts: [] };
  };

  test("lists the preview image with the page", async () => {
    await withTempProject(
      {
        toml: 'url = "https://example.com/"\n',
        decks: [{ name: "demo", theme: defaultTheme(), slides: { intro: introHtml } }],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const result = await buildCommand(resolveDecks(deckDir), { runner: fakeRunner });
        expect(result.images).toEqual([join(deckDir, "dist", "demo.png")]);
        expect(result.skipped?.map((entry) => entry.check)).toEqual(["visual"]);
        expect(formatText({ command: "build", data: result })).toBe(
          `wrote ${join(deckDir, "dist", "demo.html")}\nwrote ${join(deckDir, "dist", "demo.png")}`,
        );
      },
    );
  });

  test("says once how to get a preview image when there is no URL", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", theme: defaultTheme(), slides: { intro: introHtml } },
          { name: "beta", theme: defaultTheme(), slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const result = await buildCommand(resolveDecks(root), { runner: fakeRunner });
        expect(result.images).toEqual([]);
        expect(result.skipped?.filter((entry) => entry.check === "preview")).toEqual([
          {
            check: "preview",
            reason: "url is not set",
            hint: "set url in dek.toml, or pass --url, to the URL dist/ is served from",
          },
        ]);
        // The result on stdout stays the result; why an image is missing goes to stderr.
        expect(formatText({ command: "build", data: result })).not.toContain("preview");
      },
    );
  });

  // A build reports what dek's rules say, and those leave the rendering unmeasured: it says so,
  // as lint does, so a clean build is not read as a measured one.
  test("says the rendering was not measured", async () => {
    await withTempProject(
      { decks: [{ name: "demo", theme: defaultTheme(), slides: { intro: introHtml } }] },
      async (root) => {
        const result = await buildCommand(resolveDecks(join(root, "decks", "demo")), {
          runner: fakeRunner,
        });
        expect(result.skipped?.find((entry) => entry.check === "visual")).toEqual({
          check: "visual",
          reason: "overflow and contrast are measured only by `dek lint --visual`",
          hint: "run `dek lint --visual` to measure overflow and contrast",
        });
      },
    );
  });

  test("says how to install Playwright when it is missing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", theme: defaultTheme(), slides: { intro: introHtml } }] },
      async (root) => {
        const result = await buildCommand(resolveDecks(join(root, "decks", "demo")), {
          url: "https://example.com/",
          runner: async () => null,
        });
        expect(result.skipped?.find((entry) => entry.check === "preview")).toEqual({
          check: "preview",
          reason: "Playwright is not installed",
          hint: PLAYWRIGHT_INSTALL,
        });
      },
    );
  });

  test("rejects a --url a crawler cannot fetch", async () => {
    await withTempProject(
      { decks: [{ name: "demo", theme: defaultTheme(), slides: { intro: introHtml } }] },
      async (root) => {
        await expect(
          buildCommand(resolveDecks(join(root, "decks", "demo")), { url: "/talks/" }),
        ).rejects.toThrow('invalid --url "/talks/"');
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
        expect(result).toMatchObject({ exitCode: 0 });
        const json = jsonStdout<BuildOk>(result);
        expect(json.ok).toBe(true);
        expect(json.outs).toEqual([join(root, "dist", "demo.html")]);
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
        const result = await buildCommand(resolveDecks(join(root, "decks", "demo")));
        expect(result.outs).toEqual([join(root, "decks", "demo", "dist", "demo.html")]);
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
        const result = await buildCommand(resolveDecks(root));
        expect(result.outs).toEqual([
          join(root, "decks", "alpha", "dist", "alpha.html"),
          join(root, "decks", "beta", "dist", "beta.html"),
        ]);
        expect(await Bun.file(result.outs[0] ?? "").exists()).toBe(true);
        expect(await Bun.file(result.outs[1] ?? "").exists()).toBe(true);
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
        const result = await buildCommand(resolveDecks(root, { deck: "beta" }));
        expect(result.outs).toEqual([join(root, "decks", "beta", "dist", "beta.html")]);
        expect(await Bun.file(result.outs[0] ?? "").exists()).toBe(true);
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
        const result = await buildCommand(resolveDecks(root), { rootDist: true });
        expect(result.outs).toEqual([
          join(root, "dist", "alpha.html"),
          join(root, "dist", "beta.html"),
        ]);
        expect(await Bun.file(result.outs[0] ?? "").exists()).toBe(true);
        expect(await Bun.file(result.outs[1] ?? "").exists()).toBe(true);
      },
    );
  });

  test("builds a section with no slide HTML and reports DEK001", async () => {
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
        const result = await buildCommand(resolveDecks(join(root, "decks", "demo")));
        expect(existsSync(result.outs[0] ?? "")).toBe(true);
        expect(result.diagnostics).toContainEqual(
          expect.objectContaining({
            id: "DEK001",
            slug: "extra",
            hint: expect.stringContaining("dek sync"),
          }),
        );
      },
    );
  });
});

describe("dek build --public", () => {
  const directedScript = `---
title: Demo
---

## intro

> 目次は読み上げない。

今日は三つ話します。
`;

  test("builds a page for anyone with the link, without the stage directions", async () => {
    await withTempProject(
      { decks: [{ name: "demo", script: directedScript, slides: { intro: introHtml } }] },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const line = parseCommandLine(["build", "--public"]);
        const result = (await COMMANDS.build.run({
          cwd: deckDir,
          flags: line.values,
          args: {},
          target: resolveDecks(deckDir),
        })) as { outs: string[] };
        const html = await readFile(result.outs[0] ?? "", "utf8");
        expect(html).toContain("今日は三つ話します。");
        expect(html).not.toContain("目次は読み上げない");
      },
    );
  });
});
