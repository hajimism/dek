import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { jsonStdout, runDek, spawnDekServer } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const architectureHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">architecture</h2>
</section>`);

type ErrorJson = {
  ok: false;
  error: { hint?: string };
};

describe("dek goto / current", () => {
  test("fails with a run dek hint when the server is not running", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["current", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<ErrorJson>(result);
        expect(json.error.hint).toContain("run `dek`");
      },
    );
  });

  test("goto and current talk to the running server", async () => {
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

## architecture

body
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const { stop } = await spawnDekServer(deckDir);
        try {
          const gotoResult = await runDek(["goto", "architecture", "--json"], { cwd: deckDir });
          expect(gotoResult.exitCode).toBe(0);
          expect(jsonStdout(gotoResult)).toMatchObject({
            ok: true,
            slug: "architecture",
            slideIndex: 1,
            beatIndex: 0,
          });

          const current = await runDek(["current", "--json"], { cwd: deckDir });
          expect(current.exitCode).toBe(0);
          expect(jsonStdout(current)).toMatchObject({
            ok: true,
            slug: "architecture",
            slideIndex: 1,
            beatIndex: 0,
          });
        } finally {
          await stop();
        }
      },
    );
  });

  test("goto from a deck directory talks to a project-root server", async () => {
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

## architecture

body
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const { stop } = await spawnDekServer(root);
        try {
          const gotoResult = await runDek(["goto", "architecture", "--json"], { cwd: deckDir });
          expect(gotoResult.exitCode).toBe(0);
          expect(jsonStdout(gotoResult)).toMatchObject({
            ok: true,
            slug: "architecture",
            slideIndex: 1,
            beatIndex: 0,
          });

          const current = await runDek(["current", "--json"], { cwd: deckDir });
          expect(current.exitCode).toBe(0);
          expect(jsonStdout(current)).toMatchObject({
            ok: true,
            slug: "architecture",
            slideIndex: 1,
            beatIndex: 0,
          });
        } finally {
          await stop();
        }
      },
    );
  });
});
