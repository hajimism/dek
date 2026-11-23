import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer as createHttpServer, type Server as HttpServer } from "node:http";
import { type AddressInfo, createServer, type Server as NetServer, type Socket } from "node:net";
import { join } from "node:path";
import { outputOf } from "../../src/cli/commands.ts";
import { currentCommand, gotoCommand } from "../../src/cli/goto.ts";
import { requireDeckFromCwd } from "../../src/cli/scope.ts";
import { DekError } from "../../src/core/error.ts";
import { jsonStdout, runDek, spawnDekServer } from "../helpers/cli.ts";
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
  test("fails with a run dek hint when the server is not running", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["current", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result).toMatchObject({ exitCode: 1 });
        const json = jsonStdout<ErrorJson>(result);
        expect(json.error.hint).toContain("run `dekc`");
      },
    );
  });

  test("goto and current talk to the running server", async () => {
    await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      const { stop } = await spawnDekServer(deckDir);
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
      await withDevServer({ cwd: root }, async (server) => {
        const gotoResult = await gotoCommand(requireDeckFromCwd(deckDir), "architecture");
        expect(gotoResult).toEqual({
          slug: "architecture",
          slideIndex: 1,
          beatIndex: 0,
          viewers: 0,
          url: `${server.url}decks/demo/`,
        });
        // With no page open, the position is where the next one lands, and dek says so.
        expect(outputOf("goto").notes?.(gotoResult, false)).toBe(
          `no browser shows the deck: the next page opened at ${server.url}decks/demo/ shows architecture`,
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

  test("gives the deck's page: the root of a server started for that deck alone", async () => {
    await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
      await withDevServer({ cwd: root, deck: "demo" }, async (server) => {
        const current = await currentCommand(requireDeckFromCwd(root, "demo"));
        expect(current.url).toBe(server.url);
      });
    });
  });

  test("gives a page with no password in it, whatever the server asks of a presenter", async () => {
    await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
      await withDevServer({ cwd: root, remote: true, password: "s3cretpass" }, async (server) => {
        const current = await currentCommand(requireDeckFromCwd(root, "demo"));
        expect(current.url).toBe(`${server.url}decks/demo/`);
        expect(JSON.stringify(current)).not.toContain("s3cretpass");
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
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toBe(
          'the running dev server serves deck "demo", not "other"',
        );
        expect((error as DekError).hint).toContain("--deck demo");
      });
    });
  });
});

describe("gotoCommand against a server that never answers", () => {
  test("times out with a hint instead of waiting for good", async () => {
    const sockets = new Set<Socket>();
    const silent = createServer((socket) => sockets.add(socket));
    try {
      await expectStuck(await listening(silent));
    } finally {
      for (const socket of sockets) {
        socket.destroy();
      }
      silent.close();
    }
  });

  test("times out on an answer that stops part way", async () => {
    const stalled = createHttpServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.write("{");
    });
    try {
      await expectStuck(await listening(stalled));
    } finally {
      stalled.closeAllConnections();
      stalled.close();
    }
  });
});

describe("gotoCommand against a lock whose server is gone", () => {
  test("says the server is not running when nothing listens where the lock points", async () => {
    // A lock a killed server left, whose pid another process has since taken: this one's.
    const closed = createServer();
    const url = await listening(closed);
    await new Promise((resolve) => closed.close(resolve));
    await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
      await mkdir(join(root, ".dek"), { recursive: true });
      await writeFile(join(root, ".dek", "server.json"), JSON.stringify({ url, pid: process.pid }));
      const target = requireDeckFromCwd(join(root, "decks", "demo"));
      await expect(currentCommand(target)).rejects.toMatchObject({
        name: "DekError",
        message: "dev server is not running",
        hint: "run `dekc`",
      });
    });
  });
});

describe("gotoCommand against a server that answers with neither a deck nor a refusal", () => {
  test("names the command to restart, dekc", async () => {
    const broken = createHttpServer((_req, res) => {
      res.writeHead(500, { "content-type": "text/plain" });
      res.end("no");
    });
    const url = await listening(broken);
    try {
      await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
        await mkdir(join(root, ".dek"), { recursive: true });
        await writeFile(
          join(root, ".dek", "server.json"),
          JSON.stringify({ url, pid: process.pid }),
        );
        const target = requireDeckFromCwd(join(root, "decks", "demo"));
        await expect(currentCommand(target)).rejects.toMatchObject({
          message: "dev server current failed with HTTP 500",
          hint: `restart the server at ${url}: stop \`dekc\` and run it again`,
        });
      });
    } finally {
      broken.closeAllConnections();
      broken.close();
    }
  });
});

/** The URL of `server`, listening on a free port of 127.0.0.1. */
async function listening(server: NetServer | HttpServer): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
}

/** `dekc current` against a dev server at `url` that is stuck gives up with a hint. */
async function expectStuck(url: string): Promise<void> {
  await withTempProject({ decks: [twoSlideDeck] }, async (root) => {
    await mkdir(join(root, ".dek"), { recursive: true });
    await writeFile(join(root, ".dek", "server.json"), JSON.stringify({ url, pid: process.pid }));
    const target = requireDeckFromCwd(join(root, "decks", "demo"));
    await expect(currentCommand(target, { timeoutMs: 50 })).rejects.toMatchObject({
      name: "DekError",
      message: `the dev server at ${url} did not answer within 0.05s`,
      hint: expect.stringContaining("dekc"),
    });
  });
}
