import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CommentRow, Grant } from "../../src/pub/protocol.ts";
import { jsonStdout, runInProcess } from "../helpers/cli.ts";
import { type FakePub, withFakePub } from "../helpers/fake-pub.ts";
import { withTempProject } from "../helpers/project.ts";

type Json = Record<string, unknown> & { ok: boolean };

function signIn(fake: FakePub): void {
  mkdirSync(dirname(fake.credentials), { recursive: true });
  writeFileSync(
    fake.credentials,
    JSON.stringify({ version: 1, keys: { [fake.url]: fake.issueKey() } }),
    { mode: 0o600 },
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
    const deck = fake.addDeck({ current: 1 });
    // Run in the deck, as an agent does, so the deck needs no name.
    const deckSpec = {
      name: "talk",
      script: script(deck.id),
      slides: { intro: '<section class="slide"><h2>intro</h2></section>\n' },
    };
    return withTempProject({ decks: [deckSpec] }, (root) =>
      fn(fake, join(root, "decks", "talk"), deck.id),
    );
  });
}

const run = (fake: FakePub, cwd: string, args: string[]) =>
  runInProcess(["pub", ...args], { cwd, env: { ...fake.env, BROWSER: "true" } });

const comment = (overrides: Partial<CommentRow>): CommentRow => ({
  number: 1,
  id: "c_one",
  scope: "shared",
  slug: "intro",
  step: "0",
  status: "open",
  text: "言い方を変えたい",
  targets: [],
  author: { name: "Ann", handle: "ann" },
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
        "signed-in",
        "--json",
      ]);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: true,
        action: "share",
        id,
        visibility: "link",
        scriptPublic: true,
        embed: true,
        comments: "signed-in",
      });
      expect(fake.requests.at(-1)).toMatchObject({
        method: "PATCH",
        path: `/api/decks/${id}`,
        json: { visibility: "link", scriptPublic: true, embed: true, comments: "signed-in" },
      });
    });
  });

  test.serial("keeps the deck to the team with --visibility team", async () => {
    await withPublished(async (fake, root, id) => {
      const result = await run(fake, root, ["share", "--visibility", "team", "--json"]);
      expect(jsonStdout<Json>(result)).toMatchObject({ ok: true, id, visibility: "team" });
      expect(fake.requests.at(-1)).toMatchObject({
        method: "PATCH",
        json: { visibility: "team" },
      });
    });
  });

  test.serial(
    "gives the deck a new link with --new-link, and prints the URL that opens it now",
    async () => {
      await withPublished(async (fake, root, id) => {
        const before = fake.decks.get(id)?.url;
        const result = await run(fake, root, ["share", "--new-link", "--json"]);
        const shared = jsonStdout<Json & { url: string }>(result);
        expect(shared).toMatchObject({ ok: true, action: "share", id });
        expect(shared.url).toContain("?key=");
        expect(shared.url).not.toBe(before);
        expect(fake.requests.at(-1)).toMatchObject({
          method: "PATCH",
          path: `/api/decks/${id}`,
          json: { newLink: true },
        });
      });
    },
  );

  test.serial("refuses the old --comments guests: only signed-in accounts comment", async () => {
    await withPublished(async (fake, root) => {
      const result = await run(fake, root, ["share", "--comments", "guests", "--json"]);
      expect(result.exitCode).toBe(1);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: false,
        error: {
          message: 'invalid --comments "guests"',
          hint: "--comments takes off or signed-in, e.g. `dekc pub share --comments signed-in`",
        },
      });
      expect(fake.requests).toEqual([]);
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

describe("dekc pub grants", () => {
  const ann: Grant = {
    id: "g_ann",
    who: "ann",
    role: "comment",
    side: "team",
    createdAt: "2026-11-12T00:00:00.000Z",
  };
  const sato: Grant = {
    id: "g_sato",
    who: "sato@example.com",
    role: "view",
    side: "guest",
    createdAt: "2026-11-13T00:00:00.000Z",
  };
  const grantsOf = (fake: FakePub, id: string) => fake.decks.get(id)?.grants ?? [];

  test.serial("lists who the deck is shared with, by handle or by a waiting address", async () => {
    await withPublished(async (fake, root, id) => {
      grantsOf(fake, id).push(ann, sato);
      const json = await run(fake, root, ["grants", "--json"]);
      expect(jsonStdout<Json>(json)).toMatchObject({
        ok: true,
        action: "grants",
        grants: [ann, sato],
      });
      const text = await run(fake, root, ["grants"]);
      expect(text.stdout).toContain("@ann  comment  team");
      expect(text.stdout).toContain("sato@example.com  view  guest  (no account yet)");
    });
  });

  test.serial("shares the deck with one person, and says an invitation was mailed", async () => {
    await withPublished(async (fake, root, id) => {
      const result = await run(fake, root, [
        "grants",
        "add",
        "@Ann",
        "--role",
        "comment",
        "--side",
        "team",
        "--json",
      ]);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: true,
        action: "grant",
        grant: { who: "ann", role: "comment", side: "team" },
        invited: true,
      });
      expect(fake.requests.at(-1)).toMatchObject({
        method: "POST",
        path: `/api/decks/${id}/grants`,
        json: { who: "@Ann", role: "comment", side: "team" },
      });
    });
  });

  test.serial(
    "changes only what it is given of a grant already made, and mails no one",
    async () => {
      await withPublished(async (fake, root, id) => {
        grantsOf(fake, id).push({ ...ann });
        const result = await run(fake, root, ["grants", "add", "ann", "--side", "guest", "--json"]);
        expect(jsonStdout<Json>(result)).toMatchObject({
          ok: true,
          grant: { who: "ann", role: "comment", side: "guest" },
          invited: false,
        });
        // The role is left out, so the grant keeps the one it has.
        expect(fake.requests.at(-1)?.json).toEqual({ who: "ann", side: "guest" });
        expect(
          (await run(fake, root, ["grants", "add", "ann", "--role", "view"])).stdout,
        ).toContain("changed the grant to @ann: view, on the guests' side");
      });
    },
  );

  test.serial("stops sharing with one person, named by handle, address, or grant ID", async () => {
    await withPublished(async (fake, root, id) => {
      grantsOf(fake, id).push({ ...ann }, { ...sato });
      const result = await run(fake, root, ["grants", "remove", "@ann", "--json"]);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: true,
        action: "revoke",
        grant: { id: "g_ann", who: "ann" },
      });
      expect(fake.requests.at(-1)).toMatchObject({
        method: "DELETE",
        path: `/api/decks/${id}/grants/g_ann`,
      });
      expect((await run(fake, root, ["grants", "remove", "Sato@Example.com"])).stdout).toContain(
        "stopped sharing the deck with sato@example.com",
      );
      expect(grantsOf(fake, id)).toEqual([]);
      grantsOf(fake, id).push({ ...ann });
      await run(fake, root, ["grants", "remove", "g_ann"]);
      expect(grantsOf(fake, id)).toEqual([]);
    });
  });

  test.serial("refuses to remove a grant the deck does not have, and sends no DELETE", async () => {
    await withPublished(async (fake, root, id) => {
      grantsOf(fake, id).push({ ...ann });
      const result = await run(fake, root, ["grants", "remove", "bob", "--json"]);
      expect(result.exitCode).toBe(1);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: false,
        error: {
          message: 'deck "talk" is not shared with bob',
          hint: "`dekc pub grants` lists who it is shared with; a grant by address an account has claimed is listed by its handle",
        },
      });
      expect(fake.requests.some((request) => request.method === "DELETE")).toBe(false);
    });
  });

  test.serial("refuses a role or side it does not know before anything is sent", async () => {
    await withPublished(async (fake, root) => {
      const sent = fake.requests.length;
      const result = await run(fake, root, ["grants", "add", "ann", "--side", "client", "--json"]);
      expect(result.exitCode).toBe(1);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: false,
        error: { message: 'invalid --side "client"' },
      });
      expect(fake.requests.length).toBe(sent);
    });
  });
});

describe("dekc pub open", () => {
  test.serial("opens only a page on the server it asked", async () => {
    await withPublished(async (fake, root) => {
      const [deck] = [...fake.decks.values()];
      if (deck) {
        deck.url = "file:///etc/passwd";
      }
      const result = await run(fake, root, ["open", "--json"]);
      expect(jsonStdout<Json>(result)).toMatchObject({
        ok: false,
        error: { message: `${fake.url} gave the deck an address that is not one of its pages` },
      });
    });
  });

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
            {
              kind: "element",
              path: "../../../.ssh/id_ed25519",
              name: "div",
              text: "",
              box: { x: 0, y: 0, width: 1, height: 1 },
            },
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
          found: true,
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
        {
          kind: "element",
          path: null,
          name: "div",
          text: "",
          box: { x: 0, y: 0, width: 1, height: 1 },
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

  test.serial("names a team thread by T and its number, apart from the shared one", async () => {
    await withPublished(async (fake, root) => {
      const [deck] = [...fake.decks.values()];
      deck?.rows.push(
        comment({ number: 7, id: "c_shared" }),
        comment({ number: 7, id: "c_team", scope: "team" }),
      );
      const listed = await run(fake, root, ["comments"]);
      expect(listed.stdout).toContain("T7  intro  @ann  [c_team]");
      expect(listed.stdout).toContain("7  intro  @ann  [c_shared]");
      const team = await run(fake, root, ["comments", "resolve", "T7", "--json"]);
      expect(jsonStdout<Json>(team)).toMatchObject({ comment: "c_team" });
      const shared = await run(fake, root, ["comments", "resolve", "#7", "--json"]);
      expect(jsonStdout<Json>(shared)).toMatchObject({ comment: "c_shared" });
      const missing = await run(fake, root, ["comments", "resolve", "T8", "--json"]);
      expect(jsonStdout<Json>(missing)).toMatchObject({
        ok: false,
        error: { message: "the deck has no comment T8" },
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
        // In the deck, its name before the ID is still the deck, not the comment.
        const inside = await run(fake, deckDir, [
          "comments",
          "reply",
          "talk",
          "c_one",
          "ええ",
          "--json",
        ]);
        expect(jsonStdout<Json>(inside)).toMatchObject({
          ok: true,
          comment: "c_one",
          reply: { text: "ええ" },
        });
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

  test.serial(
    "alone, in a project with a deck named pub, says how to serve that deck",
    async () => {
      await withTempProject({ decks: [{ name: "pub" }] }, async (root) => {
        const result = await runInProcess(["pub", "--json"], { cwd: root });
        expect(jsonStdout<Json>(result)).toMatchObject({
          ok: false,
          error: {
            hint: "to serve the deck named pub, run `dekc --deck pub`; usage: dekc pub <subcommand>; run `dekc help pub`",
          },
        });
      });
    },
  );

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
