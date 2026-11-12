import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CommentRow } from "../../src/pub/protocol.ts";
import { jsonStdout, runInProcess } from "../helpers/cli.ts";
import { type FakePub, withFakePub } from "../helpers/fake-pub.ts";
import { withTempProject } from "../helpers/project.ts";

type Json = Record<string, unknown> & { ok: boolean };

function signIn(fake: FakePub): void {
  mkdirSync(dirname(fake.credentials), { recursive: true });
  writeFileSync(
    fake.credentials,
    JSON.stringify({ version: 1, keys: { [fake.url]: fake.issueKey() } }),
  );
}

const script = (id?: string) => `---
title: Talk
${id ? `pub: ${id}\n` : ""}---

## intro

今日は **dek** の
話をします。

## end

おしまい。
`;

/** A project whose deck is on the fake already, and the fake's deck. */
async function withPublished<T>(
  fn: (fake: FakePub, root: string, id: string) => Promise<T>,
): Promise<T> {
  return withFakePub(async (fake) => {
    signIn(fake);
    const deck = fake.addDeck({ current: 1, latest: 1 });
    // Run in the deck, as an agent does, so the deck needs no name.
    return withTempProject({ decks: [{ name: "talk", script: script(deck.id) }] }, (root) =>
      fn(fake, join(root, "decks", "talk"), deck.id),
    );
  });
}

const run = (fake: FakePub, cwd: string, args: string[]) =>
  runInProcess(["pub", ...args], { cwd, env: { ...fake.env, BROWSER: "true" } });

const comment = (overrides: Partial<CommentRow>): CommentRow => ({
  number: 1,
  id: "c_one",
  slug: "intro",
  step: "0",
  status: "open",
  text: "言い方を変えたい",
  targets: [],
  author: { name: "Ann", handle: "ann", guest: false },
  version: 1,
  url: "https://dek.pub/@hajime/talk#c_one",
  thread: [],
  createdAt: "2026-11-12T00:00:00.000Z",
  resolvedAt: null,
  ...overrides,
});

describe("dekc pub share", () => {
  test.serial("changes who may open, read, embed, and comment, as one PATCH", async () => {
    await withPublished(async (fake, root, id) => {
      const result = await run(fake, root, [
        "share",
        "--visibility",
        "link",
        "--script",
        "shown",
        "--embed",
        "on",
        "--comments",
        "guests",
        "--json",
      ]);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: true,
        action: "share",
        id,
        visibility: "link",
        scriptPublic: true,
        embed: true,
        comments: "guests",
      });
      expect(fake.requests.at(-1)).toMatchObject({
        method: "PATCH",
        path: `/api/decks/${id}`,
        json: { visibility: "link", scriptPublic: true, embed: true, comments: "guests" },
      });
    });
  });

  test.serial("with nothing to change says which settings it takes", async () => {
    await withPublished(async (fake, root) => {
      const result = await run(fake, root, ["share", "--json"]);
      expect(result.exitCode).toBe(1);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: false,
        error: { message: "dekc pub share needs a setting to change" },
      });
      expect(fake.requests).toEqual([]);
    });
  });

  test.serial("refuses a deck that is not on dek.pub, with publish as the way there", async () => {
    await withFakePub(async (fake) => {
      signIn(fake);
      await withTempProject({ decks: [{ name: "talk", script: script() }] }, async (root) => {
        const result = await run(fake, root, ["share", "talk", "--visibility", "public", "--json"]);
        expect(jsonStdout<Json>(result)).toMatchObject({
          ok: false,
          error: {
            message: 'deck "talk" is not on dek.pub yet: script.md has no pub:',
            path: "decks/talk/script.md",
            hint: "run `dekc pub publish talk` first; it writes pub: into decks/talk/script.md",
          },
        });
      });
    });
  });
});

describe("dekc pub open", () => {
  test.serial("--json gives the URL and opens nothing; text opens it with BROWSER", async () => {
    await withPublished(async (fake, root) => {
      const [deck] = [...fake.decks.values()];
      const json = await run(fake, root, ["open", "--json"]);
      expect(jsonStdout<Json>(json)).toEqual({
        ok: true,
        action: "open",
        server: fake.url,
        url: deck?.url,
      });
      const text = await run(fake, root, ["open"]);
      expect(text.exitCode).toBe(0);
      expect(text.stdout.trim()).toBe(deck?.url ?? "");
    });
  });
});

describe("dekc pub comments", () => {
  test.serial("places each quote in script.md and each element in its slide file", async () => {
    await withPublished(async (fake, root) => {
      const [deck] = [...fake.decks.values()];
      deck?.rows.push(
        comment({
          targets: [
            { kind: "quote", quote: "dek の 話をします", prefix: "今日は ", suffix: "。" },
            {
              kind: "element",
              path: "slides/intro.html",
              name: "h2.slide-title",
              text: "intro",
              box: { x: 0, y: 0, width: 10, height: 10 },
            },
            { kind: "quote", quote: "ない言葉", prefix: "", suffix: "" },
          ],
        }),
        comment({ number: 2, id: "c_two", status: "resolved", slug: "end" }),
      );
      const result = await run(fake, root, ["comments", "--json"]);
      const json = jsonStdout<{ comments: Array<Record<string, unknown>> }>(result);
      expect(json.comments.map((row) => row.id)).toEqual(["c_one"]);
      expect(json.comments[0]?.targets).toEqual([
        {
          kind: "quote",
          quote: "dek の 話をします",
          prefix: "今日は ",
          suffix: "。",
          path: "script.md",
          line: 8,
          column: 7,
          found: true,
        },
        {
          kind: "element",
          path: "slides/intro.html",
          name: "h2.slide-title",
          text: "intro",
          box: { x: 0, y: 0, width: 10, height: 10 },
        },
        {
          kind: "quote",
          quote: "ない言葉",
          prefix: "",
          suffix: "",
          path: "script.md",
          line: null,
          column: null,
          found: false,
        },
      ]);
      expect(json.comments[0]?.shot).toBe("dekc shot talk intro --step 0");
      expect(fake.requests.at(-1)?.query).toEqual({ status: "open" });

      const all = await run(fake, root, ["comments", "--status", "all", "--json"]);
      expect(jsonStdout<{ comments: unknown[] }>(all).comments).toHaveLength(2);
    });
  });

  test.serial("reply, resolve, and reopen take a comment by its ID or its number", async () => {
    await withPublished(async (fake, root, id) => {
      const [deck] = [...fake.decks.values()];
      deck?.rows.push(comment({ number: 7, id: "c_seven" }));
      const reply = await run(fake, root, ["comments", "reply", "7", "直しました", "--json"]);
      expect(jsonStdout<Json>(reply)).toMatchObject({
        ok: true,
        action: "reply",
        comment: "c_seven",
        reply: { text: "直しました" },
      });
      expect(fake.requests.at(-1)).toMatchObject({
        method: "POST",
        path: `/api/decks/${id}/comments/c_seven/replies`,
        json: { text: "直しました" },
      });
      const resolved = await run(fake, root, ["comments", "resolve", "c_seven", "--json"]);
      expect(jsonStdout<Json>(resolved)).toMatchObject({
        action: "resolve",
        comment: "c_seven",
        status: "resolved",
      });
      const reopened = await run(fake, root, ["comments", "reopen", "c_seven", "--json"]);
      expect(jsonStdout<Json>(reopened)).toMatchObject({ action: "reopen", status: "open" });
      const missing = await run(fake, root, ["comments", "resolve", "9", "--json"]);
      expect(jsonStdout<Json>(missing)).toMatchObject({
        ok: false,
        error: { message: "the deck has no comment 9" },
      });
    });
  });

  test.serial(
    "takes the deck after the subcommand's words, or by --deck, from the project root",
    async () => {
      await withPublished(async (fake, deckDir, id) => {
        const root = join(deckDir, "..", "..");
        const [deck] = [...fake.decks.values()];
        deck?.rows.push(comment({}));
        const named = await run(fake, root, [
          "comments",
          "reply",
          "talk",
          "c_one",
          "はい",
          "--json",
        ]);
        expect(jsonStdout<Json>(named)).toMatchObject({ ok: true, comment: "c_one" });
        const flagged = await run(fake, root, ["status", "--deck", "talk", "--json"]);
        expect(jsonStdout<Json>(flagged)).toMatchObject({ ok: true, id });
        const typo = await run(fake, root, ["status", "tlak", "--json"]);
        expect(jsonStdout<Json>(typo)).toMatchObject({ ok: false });
        const unnamed = await run(fake, root, ["publish", "--json"]);
        expect(jsonStdout<Json>(unnamed)).toMatchObject({
          ok: false,
          error: { hint: "run `dekc pub publish talk --json`" },
        });
      });
    },
  );
});

describe("dekc pub", () => {
  test.serial("alone says it needs a subcommand", async () => {
    const result = await runInProcess(["pub", "--json"], { cwd: tmpdir() });
    expect(jsonStdout<Json>(result)).toEqual({
      ok: false,
      error: {
        message: "dekc pub needs a subcommand",
        hint: "usage: dekc pub <subcommand>; run `dekc help pub`",
      },
    });
  });

  test.serial("a mistyped subcommand gets the likeliest one", async () => {
    const result = await runInProcess(["pub", "pubish", "--json"], { cwd: tmpdir() });
    expect(jsonStdout<Json>(result)).toMatchObject({
      ok: false,
      error: { hint: "did you mean `dekc pub publish`?" },
    });
  });

  test.serial(
    "dekc new refuses a deck named after a command, which `dekc pub` could not reach",
    async () => {
      await withTempProject({}, async (root) => {
        const result = await runInProcess(["new", "pub", "--json"], { cwd: root });
        expect(jsonStdout<Json>(result)).toEqual({
          ok: false,
          error: {
            message: 'deck name "pub" is a dekc command',
            hint: "`dekc pub` would run the command, not the deck; name it something else, like pub-talk",
          },
        });
      });
    },
  );
});
