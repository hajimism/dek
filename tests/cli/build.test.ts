import { describe, expect, test } from "bun:test";
import { join } from "node:path";
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

describe("dek build", () => {
  test("writes dist/<deck>.html and returns the path as JSON", async () => {
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
        const result = await runDek(["build", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<BuildOk>(result);
        expect(json.ok).toBe(true);
        expect(json.out).toBe(join(root, "decks", "demo", "dist", "demo.html"));
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
        const result = await runDek(["build", "--json"], { cwd: root });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<{ ok: true; outs: string[] }>(result);
        expect(json.outs).toEqual([
          join(root, "decks", "alpha", "dist", "alpha.html"),
          join(root, "decks", "beta", "dist", "beta.html"),
        ]);
        expect(await Bun.file(json.outs[0] ?? "").exists()).toBe(true);
        expect(await Bun.file(json.outs[1] ?? "").exists()).toBe(true);
      },
    );
  });

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

  test("builds one deck from a positional name", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
          { name: "beta", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const result = await runDek(["build", "beta", "--json"], { cwd: root });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<BuildOk>(result);
        expect(json.out).toBe(join(root, "decks", "beta", "dist", "beta.html"));
        expect(await Bun.file(json.out).exists()).toBe(true);
        expect(await Bun.file(join(root, "decks", "alpha", "dist", "alpha.html")).exists()).toBe(
          false,
        );
      },
    );
  });

  test("writes every deck into project dist with --root-dist", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
          { name: "beta", theme: ".slide { width: 1280px; }\n", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        const result = await runDek(["build", "--json", "--root-dist"], { cwd: root });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<{ ok: true; outs: string[] }>(result);
        expect(json.outs).toEqual([
          join(root, "dist", "alpha.html"),
          join(root, "dist", "beta.html"),
        ]);
        expect(await Bun.file(json.outs[0] ?? "").exists()).toBe(true);
        expect(await Bun.file(json.outs[1] ?? "").exists()).toBe(true);
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
        const result = await runDek(["build", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("dek sync");
      },
    );
  });
});
