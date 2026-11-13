// The phase 1 and 2 round trip, end to end, on Miniflare: the real `dekc pub` against `vp dev`.
// An author signs in with the device flow, publishes a sample deck, shares it; a colleague
// comments on a quoted sentence and on a slide element; the author reads the comments as JSON,
// renames the slide with `dekc mv`, publishes again, and resolves every comment from the CLI.
// Run from apps/pub: `bun run test:e2e`.

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Browser, startDevServer } from "./server.ts";

const REPO = join(import.meta.dir, "..", "..", "..", "..");
const CLI = join(REPO, "src", "cli.ts");
const PORT = Number(process.env.DEK_PUB_E2E_PORT ?? 5199 + Math.floor(Math.random() * 200));

let step = 0;
let passed = false;
function check(condition: unknown, what: string, detail?: unknown): asserts condition {
  step += 1;
  if (!condition) {
    throw new Error(
      `✗ ${step}. ${what}${detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`}`,
    );
  }
  console.log(`✓ ${step}. ${what}`);
}

type Json = Record<string, unknown> & { ok: boolean };

const work = mkdtempSync(join(tmpdir(), "dek-pub-e2e-project-"));
const config = mkdtempSync(join(tmpdir(), "dek-pub-e2e-config-"));
const server = await startDevServer(PORT);

async function dekc(args: string[], cwd = join(work, "decks", "why-dek")): Promise<Json> {
  const server_ = args[0] === "pub" ? ["--server", server.url] : [];
  const child = Bun.spawn(["bun", CLI, ...args, ...server_, "--json"], {
    cwd,
    env: {
      ...process.env,
      DEK_PUB_CREDENTIALS: join(config, "credentials.json"),
      XDG_CONFIG_HOME: config,
      DEK_TOKEN: "",
      NO_COLOR: "1",
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  await child.exited;
  const line = out.trim().split("\n").at(-1) ?? "";
  try {
    return JSON.parse(line) as Json;
  } catch {
    throw new Error(`dekc ${args.join(" ")} printed no JSON:\n${out}\n${err}`);
  }
}

try {
  cpSync(join(REPO, "sample"), work, {
    recursive: true,
    filter: (path) => !/\/(node_modules|dist|\.cache)(\/|$)/.test(path),
  });

  // The author signs in: the CLI asks for a code, the browser approves it, the CLI gets a key.
  const author = new Browser(server.url);
  const me = await author.signUp("Author");
  const pending = await dekc(["pub", "login"]);
  check(
    pending.ok && pending.status === "pending" && typeof pending.code === "string",
    "login --json gives a code to show",
    pending,
  );
  await author.approveDevice(String(pending.code));
  const signedIn = await dekc(["pub", "login"]);
  check(
    signedIn.ok && signedIn.status === "signed-in",
    "a second login --json finishes once the code is approved",
    signedIn,
  );
  const whoami = await dekc(["pub", "whoami"]);
  check(
    (whoami.me as { handle?: string })?.handle === me.handle,
    "whoami names the author",
    whoami,
  );

  // The first publish creates the deck and writes its ID into script.md.
  const first = await dekc(["pub", "publish", "-m", "first"]);
  check(first.ok && first.n === 1, "publish uploads version 1", first);
  const script = await Bun.file(join(work, "decks", "why-dek", "script.md")).text();
  check(/^pub: d_[0-9a-z]+$/m.test(script), "publish writes pub: into script.md");
  const id = String(first.id);

  // A private deck is invisible to others, in the page and on the deck's own origin.
  const stranger = new Browser(server.url);
  await stranger.signUp("Stranger");
  const talkPath = `/@${me.handle}/why-dek`;
  check((await stranger.fetch(talkPath)).status === 404, "a private talk is a 404 to someone else");
  check(
    (await fetch(`${server.deckOrigin(id)}/v/1/`)).status === 404,
    "the serve origin hands out nothing without a token",
  );

  // Shared by link with the script and comments open, it reads as an article.
  const shared = await dekc([
    "pub",
    "share",
    "--visibility",
    "link",
    "--script",
    "shown",
    "--comments",
    "signed-in",
  ]);
  check(
    shared.ok && (shared as { visibility?: string }).visibility === "link",
    "share opens the deck to the link",
    shared,
  );
  const page = await stranger.fetch(talkPath);
  const html = await page.text();
  check(page.status === 200, "the talk page answers anyone with the link");
  const frame = /<iframe[^>]+src="([^"]+)"/.exec(html)?.[1]?.replace(/&amp;/g, "&");
  check(
    frame?.startsWith(server.deckOrigin(id)),
    "the viewer frames the deck from its own origin",
    frame,
  );
  check(
    (await fetch(frame ?? "")).status === 200,
    "the framed deck is served with the token the page signed",
  );
  const status = await dekc(["pub", "status"]);
  const versions = (status as { versions?: Array<{ n: number }> }).versions ?? [];
  check(status.ok && versions.length === 1, "status lists the version", status);

  // A colleague comments on a sentence of the script and on an element of a slide.
  const map = (await (await stranger.fetch(`/api/decks/${id}/comments?status=all`)).json()) as {
    comments?: unknown[];
  };
  check(Array.isArray(map.comments), "a signed-in reader may read the comments", map);
  const deck = (await (await author.fetch(`/api/decks/${id}`)).json()) as {
    versions: Array<{ n: number }>;
  };
  check(deck.versions.length === 1, "the owner reads the deck's status in the browser too");
  const slides = await slideMapOf(author, id);
  const target = slides.find((slide) => slide.paragraphs.length > 0);
  check(target !== undefined, "the slide map carries paragraphs said aloud");
  const quote = (target.paragraphs[0] ?? "").slice(0, 12);
  const quoted = await stranger.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: {
      anchor: {
        slug: target.slug,
        step: "0",
        targets: [{ kind: "quote", quote, prefix: "", suffix: "" }],
      },
      text: "出典がほしい",
      version: 1,
    },
  });
  check(
    quoted.status === 201,
    "a colleague comments on a quoted sentence",
    await quoted.clone().text(),
  );
  const element = await stranger.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: {
      anchor: {
        slug: target.slug,
        step: "0",
        targets: [
          {
            kind: "element",
            path: `slides/${target.slug}.html`,
            name: "h1",
            text: "title",
            box: { x: 10, y: 10, width: 200, height: 40 },
          },
        ],
      },
      text: "見出しを短く",
    },
  });
  check(
    element.status === 201,
    "a colleague comments on a slide element",
    await element.clone().text(),
  );

  // The author's agent reads them in the annotations-like shape.
  const listed = await dekc(["pub", "comments"]);
  const rows =
    (
      listed as {
        comments?: Array<{
          id: string;
          number: number;
          slug: string;
          status: string;
          targets: Array<Record<string, unknown>>;
        }>;
      }
    ).comments ?? [];
  check(listed.ok && rows.length === 2, "dekc pub comments lists both", listed);
  const quoteRow = rows.find((row) => row.targets.some((t) => t.kind === "quote"));
  check(
    quoteRow?.targets.some((t) => t.line !== undefined || t.found !== undefined),
    "a quote says where it is in script.md now",
    quoteRow,
  );

  // The author renames the slide and publishes again: the comments follow the new slug.
  const renamed = `${target.slug}-v2`;
  const mv = await dekc(["mv", target.slug, renamed]);
  check(mv.ok, "dekc mv renames the slide and records it", mv);
  const second = await dekc(["pub", "publish", "-m", "renamed"]);
  check(second.ok && second.n === 2, "publish uploads version 2", second);
  const after = await dekc(["pub", "comments"]);
  const moved = ((after as { comments?: Array<{ slug: string }> }).comments ?? []).map(
    (row) => row.slug,
  );
  check(
    moved.length === 2 && moved.every((slug) => slug === renamed),
    "the comments follow the rename",
    after,
  );

  // A version held back with --no-promote is the owner's: a reader can neither read the comments
  // placed on it nor open a thread on it, and so learns nothing of its slides.
  const held = await dekc(["pub", "publish", "--no-promote", "-m", "held back"]);
  check(
    held.ok && held.n === 3 && held.current === 2,
    "publish --no-promote holds version 3 back",
    held,
  );
  const onHeld = await stranger.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: { anchor: { slug: renamed, step: "0", targets: [] }, text: "早見え", version: 3 },
  });
  check(
    onHeld.status === 422 && (await onHeld.json()).error?.code === "unknown_version",
    "a reader cannot open a thread on a version held back",
  );
  check(
    (await stranger.fetch(`/api/decks/${id}/comments?status=all&version=3`)).status === 404,
    "a reader cannot read comments placed on a version held back",
  );
  check(
    (await author.fetch(`/api/decks/${id}/comments?status=all&version=3`)).status === 200,
    "the owner reads comments placed on a version held back",
  );
  const ownerHeld = await author.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: { anchor: { slug: renamed, step: "0", targets: [] }, text: "保留版のメモ", version: 3 },
  });
  check(ownerHeld.status === 201, "the owner opens a thread on the version held back");
  const ownerThread = ((await ownerHeld.json()) as { id: string }).id;
  const readerSees = (await (
    await stranger.fetch(`/api/decks/${id}/comments?status=all`)
  ).json()) as { comments: Array<{ id: string }> };
  check(
    !readerSees.comments.some((row) => row.id === ownerThread),
    "a reader does not see a thread on a version held back",
  );
  check(
    (
      await stranger.fetch(`/api/decks/${id}/comments/${ownerThread}/replies`, {
        method: "POST",
        json: { text: "見えた" },
      })
    ).status === 404,
    "a reader cannot reply to a thread on a version held back",
  );

  // Older than the current version is not the same as once current: version 3 was never shown,
  // so with version 4 current a reader still learns nothing of it.
  const fourth = await dekc(["pub", "publish", "-m", "after the held one"]);
  check(fourth.ok && fourth.n === 4 && fourth.current === 4, "publish uploads version 4", fourth);
  const probe = await stranger.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: { anchor: { slug: "no-such-slide", step: "0", targets: [] }, text: "探り", version: 3 },
  });
  check(
    probe.status === 409 && (await probe.json()).error?.code === "stale_version",
    "a reader cannot probe a held-back version below the current one",
  );
  await author.fetch(`/api/decks/${id}/comments/${ownerThread}/resolve`, { method: "POST" });

  // A hidden script cannot be quoted, so a reader cannot test a guess at its words.
  await dekc(["pub", "share", "--script", "hidden"]);
  const guess = await stranger.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: {
      anchor: {
        slug: renamed,
        step: "0",
        targets: [{ kind: "quote", quote, prefix: "", suffix: "" }],
      },
      text: "推測",
    },
  });
  check(
    guess.status === 403 && (await guess.json()).error?.code === "script_hidden",
    "a reader cannot quote a hidden script",
  );
  const quotedId = ((await quoted.json()) as { id: string }).id;
  const closed = await stranger.fetch(`/api/decks/${id}/comments/${quotedId}/resolve`, {
    method: "POST",
  });
  const closedRow = (await closed.json()) as { targets: Array<{ kind: string; quote?: string }> };
  check(
    closed.status === 200 &&
      closedRow.targets.every((target) => target.kind !== "quote" || target.quote === ""),
    "a reader's own thread comes back without the words of a hidden script",
    closedRow,
  );
  await stranger.fetch(`/api/decks/${id}/comments/${quotedId}/reopen`, { method: "POST" });
  await dekc(["pub", "share", "--script", "shown"]);

  // Reply, then resolve them all from the CLI.
  const reply = await dekc(["pub", "comments", "reply", String(rows[0]?.number), "直しました"]);
  check(reply.ok, "dekc pub comments reply answers a thread", reply);
  for (const row of rows) {
    const resolved = await dekc(["pub", "comments", "resolve", String(row.number)]);
    check(resolved.ok, `dekc pub comments resolve closes #${row.number}`, resolved);
  }
  const open = await dekc(["pub", "comments"]);
  check(
    open.ok && ((open as { comments?: unknown[] }).comments ?? []).length === 0,
    "no comment is left open",
    open,
  );

  // Grants: a private deck shared with one person by handle.
  await dekc(["pub", "share", "--visibility", "private"]);
  check(
    (await stranger.fetch(talkPath)).status === 404,
    "back to private, the talk is a 404 again",
  );
  const grant = await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: {
      who: `@${(await stranger.fetch("/api/me").then((r) => r.json())).handle}`,
      role: "view",
    },
  });
  check(grant.status === 201, "the owner grants the colleague a view", await grant.clone().text());
  check(
    (await stranger.fetch(talkPath)).status === 200,
    "the granted colleague sees the private talk",
  );

  // Team and client: a view grant reads the threads its side may, and the client's side never
  // learns of a thread kept to the team until it is shared.
  const strangerHandle = (await stranger.fetch("/api/me").then((r) => r.json())).handle;
  const clientList = async () =>
    (await (await stranger.fetch(`/api/decks/${id}/comments?status=all`)).json()) as {
      comments?: Array<{ id: string; number: number; scope: string }>;
    };
  check(
    Array.isArray((await clientList()).comments),
    "a colleague granted a view reads the comments",
  );
  const teamNote = await author.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: { anchor: { slug: renamed, step: "0", targets: [] }, text: "社内だけのメモ" },
  });
  const teamRow = (await teamNote.json()) as { id: string; scope: string; number: number };
  check(
    teamNote.status === 201 && teamRow.scope === "team",
    "the owner's thread is kept to the team unless shared",
    teamRow,
  );
  check(
    !(await clientList()).comments?.some((row) => row.id === teamRow.id),
    "the client's side does not see a team thread",
  );
  check(
    (await stranger.fetch(`/api/decks/${id}/comments/${teamRow.id}/widen`, { method: "POST" }))
      .status === 404,
    "the client's side cannot reach a team thread at all",
  );
  await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: { who: `@${strangerHandle}`, role: "comment" },
  });
  const asTeam = await stranger.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: {
      anchor: { slug: renamed, step: "0", targets: [] },
      text: "チームだけに",
      scope: "team",
    },
  });
  check(
    asTeam.status === 403 && (await asTeam.json()).error?.code === "team_only",
    "the client's side cannot open a thread for the team alone",
  );
  const widened = await author.fetch(`/api/decks/${id}/comments/${teamRow.id}/widen`, {
    method: "POST",
  });
  const widenedRow = (await widened.json()) as { scope: string; number: number };
  const shownToClient = (await clientList()).comments?.find((row) => row.id === teamRow.id);
  check(
    widened.status === 200 &&
      widenedRow.scope === "shared" &&
      shownToClient?.number === Math.max(...rows.map((row) => row.number)) + 1,
    "a shared team thread reaches the client under the next shared number",
    { widenedRow, shownToClient },
  );
  const teamGrant = await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: { who: `@${strangerHandle}`, role: "comment", side: "team" },
  });
  check(
    ((await teamGrant.json()) as { side?: string }).side === "team" &&
      ((await clientList()).comments ?? []).some((row) => row.scope === "team"),
    "a colleague moved to the team's side reads the team's threads",
  );

  // What changed between the versions.
  const status2 = await dekc(["pub", "status"]);
  const v2 = (
    (status2 as { versions?: Array<{ n: number; changed?: string[] }> }).versions ?? []
  ).find((v) => v.n === 2);
  check(Array.isArray(v2?.changed), "the version lists the slides it changed", v2);

  const logout = await dekc(["pub", "logout"]);
  check(logout.ok, "logout revokes the key", logout);
  const gone = await dekc(["pub", "whoami"]);
  check(!gone.ok, "after logout the CLI is signed out", gone);
  console.log(`\nall ${step} checks passed`);
  passed = true;
} finally {
  await server.stop();
  rmSync(work, { recursive: true, force: true });
  rmSync(config, { recursive: true, force: true });
}
process.exit(passed ? 0 : 1);

async function slideMapOf(
  browser: Browser,
  id: string,
): Promise<Array<{ slug: string; paragraphs: string[] }>> {
  // The owner's own view of the newest version's map, through the dev database explorer would
  // couple the test to Miniflare; the comment API refuses a quote not on its slide, so the map is
  // read from the build the CLI just made instead.
  void browser;
  void id;
  const built = Bun.spawn(["bun", CLI, "build", "--public", "--json"], {
    cwd: join(work, "decks", "why-dek"),
    stdout: "pipe",
    stderr: "ignore",
  });
  const json = JSON.parse(
    (await new Response(built.stdout).text()).trim().split("\n").at(-1) ?? "{}",
  ) as {
    slideMaps?: Array<{ slides: Array<{ slug: string; paragraphs: string[] }> }>;
  };
  return json.slideMaps?.[0]?.slides ?? [];
}
