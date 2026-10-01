import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { outputOf } from "../../src/cli/commands.ts";
import { currentCommand, gotoCommand } from "../../src/cli/goto.ts";
import { requireDeckFromCwd } from "../../src/cli/scope.ts";
import { DekcError } from "../../src/core/error.ts";
import { jsonStdout, runDekc, spawnDekcServer } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { withDevServer } from "../helpers/server.ts";

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

const twoSlideDeck = {
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
};

describe("dekc goto / current", () => {
  test("fails with a run dekc hint when the server is not running", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDekc(["current", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result).toMatchObject({ exitCode: 1 });
        const json = jsonStdout<ErrorJson>(result);
        expect(json.error.hint).toContain("run `dekc`");
      },
    );
  });

  test("goto and current talk to the running server", async () => {
    await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      const { stop } = await spawnDekcServer(deckDir);
      try {
        const gotoResult = await gotoCommand(requireDeckFromCwd(deckDir), "architecture");
        expect(gotoResult).toMatchObject({
          slug: "architecture",
          slideIndex: 1,
          beatIndex: 0,
        });
        const current = await currentCommand(requireDeckFromCwd(deckDir));
        expect(current).toMatchObject({
          slug: "architecture",
          slideIndex: 1,
          beatIndex: 0,
        });
      } finally {
        await stop();
      }
    });
  });
});

describe("gotoCommand", () => {
  test("goto from a deck directory talks to a project-root server", async () => {
    await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await withDevServer({ cwd: root }, async () => {
        const gotoResult = await gotoCommand(requireDeckFromCwd(deckDir), "architecture");
        expect(gotoResult).toMatchObject({
          slug: "architecture",
          slideIndex: 1,
          beatIndex: 0,
          viewers: 0,
        });
        // With no page open, the position is where the next one lands, and dekc says so.
        expect(outputOf("goto").notes?.(gotoResult, false)).toBe(
          "no browser shows the deck: the next page opened on the dev server shows architecture",
        );
        const current = await currentCommand(requireDeckFromCwd(deckDir));
        expect(current).toMatchObject({
          slug: "architecture",
          slideIndex: 1,
          beatIndex: 0,
        });
      });
    });
  });
});

describe("gotoCommand against a server for another deck", () => {
  test("says which deck the running server serves instead of failing to parse", async () => {
    const other = { ...twoSlideDeck, name: "other" };
    await withTempProject({ decks: [twoSlideDeck, other] }, async (root) => {
      await withDevServer({ cwd: root, deck: "demo" }, async () => {
        const error = await gotoCommand(requireDeckFromCwd(root, "other"), "intro").catch(
          (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(DekcError);
        expect((error as DekcError).message).toBe(
          'the running dev server serves deck "demo", not "other"',
        );
        expect((error as DekcError).hint).toContain("--deck demo");
      });
    });
  });
});
