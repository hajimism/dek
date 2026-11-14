// The phase 1 and 2 round trip, end to end, on Miniflare: the real `dekc pub` against `vp dev`.
// An author signs in with the device flow, publishes a sample deck, shares it; a colleague
// comments on a quoted sentence and on a slide element; the author reads the comments as JSON,
// renames the slide with `dekc mv`, publishes again, and resolves every comment from the CLI.
// Run from apps/pub: `bun run test:e2e`.

import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Browser, Inbox, startDevServer } from "./server.ts";

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
const inbox = new Inbox(server.url);

async function dekc(
  args: string[],
  cwd = join(work, "decks", "why-dek"),
  options: { server?: string; env?: Record<string, string> } = {},
): Promise<Json> {
  const server_ = args[0] === "pub" ? ["--server", options.server ?? server.url] : [];
  const child = Bun.spawn(["bun", CLI, ...args, ...server_, "--json"], {
    cwd,
    env: {
      ...process.env,
      DEK_PUB_CREDENTIALS: join(config, "credentials.json"),
      XDG_CONFIG_HOME: config,
      DEK_TOKEN: "",
      NO_COLOR: "1",
      ...options.env,
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

  // A new deck is the team's alone, invisible to others, in the page and on its own origin.
  check(first.visibility === "team", "a new deck starts with the team alone", first);
  const stranger = new Browser(server.url);
  const strangerMe = await stranger.signUp("Stranger");
  const talkPath = `/@${me.handle}/why-dek`;
  check((await stranger.fetch(talkPath)).status === 404, "a team talk is a 404 to someone else");
  const about = await fetch(`${server.url}/about?lang=en`);
  const aboutHtml = await about.text();
  check(
    about.status === 200 && /<h1[^>]*>A talk keeps reaching people/.test(aboutHtml),
    "the About page answers anyone",
  );
  check(
    aboutHtml.includes(`<link rel="canonical" href="${server.url}/about?lang=en"`) &&
      aboutHtml.includes(`hreflang="ja" href="${server.url}/about"`),
    "the About page in English names its own URL as canonical, and the Japanese one beside it",
  );
  check(
    (await fetch(`${server.deckOrigin(id)}/v/1/`)).status === 404,
    "the serve origin hands out nothing without a token",
  );
  check(
    (await (await fetch(`${server.url}/robots.txt`)).text()) === "User-agent: *\nDisallow: /\n",
    "robots.txt keeps crawlers out of any origin but dek.pub",
  );
  const securityTxt = await fetch(`${server.url}/.well-known/security.txt`);
  check(
    securityTxt.ok && (await securityTxt.text()).includes("Contact: "),
    "security.txt says where to report",
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
  const profile = `/@${me.handle}`;
  check(
    (await stranger.fetch(profile)).status === 200 &&
      (await stranger.fetch(`${profile}?page=2`)).status === 404 &&
      (await stranger.fetch(`${profile}?page=two`)).status === 200,
    "a profile's first page answers, a page past its last is a 404, and a page that is no number is the first",
  );
  type TalkPage = { talks: Array<{ slug: string }>; total: number };
  const talksOf = async (who: Browser, page: number) => {
    const response = await who.fetch(`/api/people/${me.handle}/talks?page=${page}`);
    return {
      status: response.status,
      body: response.ok ? ((await response.json()) as TalkPage) : null,
    };
  };
  const ownTalks = await talksOf(author, 1);
  const strangersTalks = await talksOf(stranger, 1);
  check(
    ownTalks.body?.total === 1 &&
      ownTalks.body.talks[0]?.slug === "why-dek" &&
      strangersTalks.body?.total === 0 &&
      (await talksOf(stranger, 2)).status === 404,
    "the talks a profile loads for more are the owner's all, anyone else's public, and none past the last page",
    { ownTalks, strangersTalks },
  );
  const sitemap = await fetch(`${server.url}/sitemap.xml`);
  const sitemapXml = await sitemap.text();
  check(
    sitemap.ok &&
      sitemapXml.includes(`<loc>${server.url}/about?lang=en</loc>`) &&
      !sitemapXml.includes(talkPath),
    "the sitemap lists the About page, and not a talk shared by link",
    sitemapXml,
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
  check(status.ok && status.current === 1, "status names the current version", status);

  // Review threads are for the people a deck is shared with: a signed-in reader with the link
  // reads none until the owner grants them the deck, which mails them a link to it.
  check(
    (await stranger.fetch(`/api/decks/${id}/comments?status=all`)).status === 404,
    "a signed-in reader with no grant reads no review threads",
  );
  const commentGrant = await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: { who: `@${strangerMe.handle}`, role: "comment" },
  });
  check(commentGrant.status === 201, "the owner grants the colleague comment");
  const invited = await inbox.waitFor(strangerMe.email, "shared");
  check(
    invited.length === 1 && invited[0]?.text.includes(talkPath),
    "a new grant mails the colleague a link to the talk",
    invited,
  );

  // The colleague comments on a sentence of the script and on an element of a slide.
  const map = (await (await stranger.fetch(`/api/decks/${id}/comments?status=all`)).json()) as {
    comments?: unknown[];
  };
  check(Array.isArray(map.comments), "a colleague granted the deck reads the review threads", map);
  const deck = (await (await author.fetch(`/api/decks/${id}`)).json()) as { current: number };
  check(deck.current === 1, "the owner reads the deck's status in the browser too");
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
  const told = await inbox.waitFor(me.email, "commented on");
  check(
    told.some((mail) => mail.text.includes("出典がほしい") && mail.text.includes(talkPath)),
    "the owner is mailed of a new thread, with its words and a link to it",
    told,
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

  // The version before is deleted: a page still open on it gets 404 for its frame, and is told
  // to reload when it comments.
  check(
    second.current === 2 &&
      (await eventually(async () => (await fetch(frame ?? "")).status === 404)),
    "a publish makes its version current and deletes the one before",
    { second, frame },
  );
  const onOld = await stranger.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: { anchor: { slug: target.slug, step: "0", targets: [] }, text: "古い版", version: 1 },
  });
  check(
    onOld.status === 409 && (await onOld.json()).error?.code === "stale_version",
    "a comment from a page on the deleted version is told to reload",
  );

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

  // Public comments, at the bottom of a talk anyone with the link may open: posted as the
  // comment policy lets, by people who read no review threads, and a like from each account.
  const reader = new Browser(server.url);
  await reader.signUp("Reader");
  const publicPath = `/api/decks/${id}/public-comments`;
  const review = await reader.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: { anchor: { slug: renamed, step: "0", targets: [] }, text: "レビュー" },
  });
  check(review.status === 403, "a reader with no grant writes no review thread");
  const posted = await reader.fetch(publicPath, {
    method: "POST",
    json: { text: "良い発表でした" },
  });
  const postedRow = (await posted.json()) as { id: string; author: { handle: string } };
  check(
    posted.status === 201 && postedRow.author.handle !== "",
    "a signed-in reader posts a public comment, under their handle",
    postedRow,
  );
  const publicReply = await reader.fetch(publicPath, {
    method: "POST",
    json: { text: "補足: 資料はこちら", parentId: postedRow.id },
  });
  const repliedRow = (await publicReply.json()) as { id: string };
  const publicList = async (who: Browser) =>
    (
      (await (await who.fetch(publicPath)).json()) as {
        comments: Array<{
          id: string;
          text: string;
          editedAt: string | null;
          replies: Array<{ id: string }>;
        }>;
      }
    ).comments;
  const publicRows = await publicList(stranger);
  check(
    publicReply.status === 201 &&
      publicRows[0]?.id === postedRow.id &&
      publicRows[0]?.replies[0]?.id === repliedRow.id,
    "a reply sits under the comment it answers, for anyone to read",
    publicRows,
  );
  check(
    (
      await reader.fetch(publicPath, {
        method: "POST",
        json: { text: "x", parentId: repliedRow.id },
      })
    ).status === 422,
    "a reply answers a comment, not another reply",
  );
  const edited = await reader.fetch(`${publicPath}/${postedRow.id}`, {
    method: "PATCH",
    json: { text: "とても良い発表でした" },
  });
  check(
    edited.status === 200 &&
      ((await edited.json()) as { editedAt: string | null }).editedAt !== null,
    "its author changes a public comment",
  );
  check(
    (
      await stranger.fetch(`${publicPath}/${postedRow.id}`, {
        method: "PATCH",
        json: { text: "x" },
      })
    ).status === 403,
    "no one else changes it",
  );
  check(
    (await author.fetch(`${publicPath}/${postedRow.id}`, { method: "DELETE" })).status === 200 &&
      (await publicList(reader)).length === 0,
    "the owner removes a public comment, and its replies go with it",
  );
  await dekc(["pub", "share", "--comments", "off"]);
  check(
    (await reader.fetch(publicPath, { method: "POST", json: { text: "x" } })).status === 403 &&
      (await reader.fetch(publicPath)).status === 200,
    "with the policy off, no one posts and anyone still reads",
  );
  await dekc(["pub", "share", "--comments", "signed-in"]);
  const signedOut = new Browser(server.url);
  const refused = await signedOut.fetch(publicPath, { method: "POST", json: { text: "x" } });
  const refusal = (await refused.json()) as { error: { code: string; hint?: string } };
  check(
    refused.status === 403 &&
      refusal.error.code === "no_comments" &&
      refusal.error.hint === "sign in to comment",
    "someone signed out posts no public comment, and is told to sign in",
    refusal,
  );
  const noSignedOut = await dekc(["pub", "share", "--comments", "guests"]);
  check(
    noSignedOut.ok === false &&
      (noSignedOut.error as { message: string }).message === 'invalid --comments "guests"',
    "dekc takes no --comments guests, the old policy for signed-out writers",
    noSignedOut,
  );
  const likePath = `/api/decks/${id}/like`;
  const liked = (await (await reader.fetch(likePath, { method: "PUT" })).json()) as {
    count: number;
    liked: boolean;
  };
  await author.fetch(likePath, { method: "PUT" });
  await reader.fetch(likePath, { method: "PUT" });
  const unliked = (await (await reader.fetch(likePath, { method: "DELETE" })).json()) as {
    count: number;
    liked: boolean;
  };
  check(
    liked.count === 1 && liked.liked && unliked.count === 1 && !unliked.liked,
    "each account likes a talk once, and may take it back",
    { liked, unliked },
  );
  check(
    (await signedOut.fetch(likePath, { method: "PUT" })).status === 401,
    "someone signed out cannot like",
  );

  // Grants: a private deck shared with one person by handle.
  await dekc(["pub", "share", "--visibility", "private"]);
  check(
    (await reader.fetch(talkPath)).status === 404,
    "back to private, the talk is a 404 again to anyone not granted it",
  );
  check((await author.fetch(publicPath)).status === 404, "a private talk has no public comments");
  const grant = await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: {
      who: `@${(await stranger.fetch("/api/me").then((r) => r.json())).handle}`,
      role: "view",
    },
  });
  check(grant.status === 201, "the owner grants the colleague a view", await grant.clone().text());
  check(
    (await inbox.waitFor(strangerMe.email, "shared")).length === 1,
    "changing a grant mails nothing",
  );
  check(
    (await stranger.fetch(talkPath)).status === 200,
    "the granted colleague sees the private talk",
  );

  // Team and guests: a view grant reads the threads its side may, and the guests' side never
  // learns of a thread kept to the team until it is shared.
  const strangerHandle = (await stranger.fetch("/api/me").then((r) => r.json())).handle;
  const guestList = async () =>
    (await (await stranger.fetch(`/api/decks/${id}/comments?status=all`)).json()) as {
      comments?: Array<{ id: string; number: number; scope: string }>;
    };
  check(
    Array.isArray((await guestList()).comments),
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
    !(await guestList()).comments?.some((row) => row.id === teamRow.id),
    "the guests' side does not see a team thread",
  );
  check(
    (await stranger.fetch(`/api/decks/${id}/comments/${teamRow.id}/widen`, { method: "POST" }))
      .status === 404,
    "the guests' side cannot reach a team thread at all",
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
    "the guests' side cannot open a thread for the team alone",
  );
  const widened = await author.fetch(`/api/decks/${id}/comments/${teamRow.id}/widen`, {
    method: "POST",
  });
  const widenedRow = (await widened.json()) as { scope: string; number: number };
  const shownToGuest = (await guestList()).comments?.find((row) => row.id === teamRow.id);
  check(
    widened.status === 200 &&
      widenedRow.scope === "shared" &&
      shownToGuest?.number === Math.max(...rows.map((row) => row.number)) + 1,
    "a shared team thread reaches the guest under the next shared number",
    { widenedRow, shownToGuest },
  );
  const teamOnly = (await (
    await author.fetch(`/api/decks/${id}/comments`, {
      method: "POST",
      json: { anchor: { slug: renamed, step: "0", targets: [] }, text: "チームだけの続き" },
    })
  ).json()) as { id: string };
  const teamGrant = await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: { who: `@${strangerHandle}`, role: "comment", side: "team" },
  });
  check(
    ((await teamGrant.json()) as { side?: string }).side === "team" &&
      ((await guestList()).comments ?? []).some((row) => row.id === teamOnly.id),
    "a colleague moved to the team's side reads the team's threads",
  );

  // A guest invited by address signs in by a link mailed to it, with no account made first. An
  // address nothing waits for gets no link, and the same answer.
  const guestEmail = `guest-${Date.now()}@example.com`;
  const nobody = `nobody-${Date.now()}@example.com`;
  await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: { who: guestEmail, role: "comment" },
  });
  const invitation = (await inbox.waitFor(guestEmail, "shared"))[0];
  check(
    invitation?.text.includes(`/signin?next=${encodeURIComponent(talkPath)}`) &&
      invitation.text.includes(`sign in with ${guestEmail}`),
    "a grant by address mails an invitation to sign in with it",
    invitation,
  );
  const guest = new Browser(server.url);
  const askFor = (email: string) =>
    guest.fetch("/api/auth/sign-in/magic-link", {
      method: "POST",
      json: { email, callbackURL: talkPath, errorCallbackURL: "/signin" },
    });
  const unknown = await askFor(nobody);
  const known = await askFor(guestEmail);
  check(
    unknown.status === 200 &&
      known.status === 200 &&
      JSON.stringify(await unknown.json()) === JSON.stringify(await known.json()),
    "asking for a sign-in link answers the same for any address",
  );
  const linkMail = (await inbox.waitFor(guestEmail, "Sign in"))[0];
  const link = /https?:\/\/\S+\/magic-link\/verify\S+/.exec(linkMail?.text ?? "")?.[0];
  check(link !== undefined, "an invited address is mailed a sign-in link", linkMail);
  check((await inbox.to(nobody)).length === 0, "an address nothing waits for is mailed nothing");
  const verified = await guest.fetch(new URL(link).pathname + new URL(link).search);
  check(
    verified.status === 302 && verified.headers.get("location")?.endsWith(talkPath),
    "the link signs the guest in and sends them to the talk",
    { status: verified.status, location: verified.headers.get("location") },
  );
  const guestMe = (await (await guest.fetch("/api/me")).json()) as {
    name?: string;
    handle?: string;
  };
  check(
    guestMe.name === guestEmail.split("@")[0],
    "an account made by a sign-in link goes by its address's local part",
    guestMe,
  );
  const grantees = async () =>
    (
      (await (await author.fetch(`/api/decks/${id}/grants`)).json()) as {
        grants: Array<{ id: string; who: string }>;
      }
    ).grants;
  const claimedGrants = await grantees();
  check(
    claimedGrants.some((row) => row.who === guestMe.handle) &&
      !claimedGrants.some((row) => row.who === guestEmail),
    "signing in by the link claims the grant waiting on the address, before any deck is read",
    claimedGrants,
  );
  check(
    (await guest.fetch(talkPath)).status === 200,
    "signed in by the link, the guest opens the private talk shared with their address",
  );
  const again = await new Browser(server.url).fetch(new URL(link).pathname + new URL(link).search);
  check(again.headers.get("location")?.includes("error=") === true, "a sign-in link works once", {
    status: again.status,
    location: again.headers.get("location"),
  });

  // The people in a thread are mailed of replies, unless they muted the deck.
  const asked = await guest.fetch(`/api/decks/${id}/comments`, {
    method: "POST",
    json: { anchor: { slug: renamed, step: "0", targets: [] }, text: "この数字の根拠は？" },
  });
  const askedRow = (await asked.json()) as { id: string };
  const replyToGuest = (text: string) =>
    author.fetch(`/api/decks/${id}/comments/${askedRow.id}/replies`, {
      method: "POST",
      json: { text },
    });
  await replyToGuest("社内の調査です");
  const replied = await inbox.waitFor(guestEmail, "replied on");
  check(
    replied.length === 1 && replied[0]?.text.includes("社内の調査です"),
    "the thread's author is mailed of a reply",
    replied,
  );
  const mute = await guest.fetch(`/api/decks/${id}/mute`, { method: "PUT" });
  check(
    mute.status === 200 && ((await mute.json()) as { muted?: boolean }).muted === true,
    "a reader mutes the deck's mail",
  );
  await replyToGuest("補足です");
  await guest.fetch(`/api/decks/${id}/mute`, { method: "DELETE" });
  await replyToGuest("もう一つ補足です");
  const afterMute = await inbox.waitFor(guestEmail, "replied on", 2);
  check(
    afterMute.length === 2 && !afterMute.some((mail) => mail.text.split("\n")[0] === "補足です"),
    "nothing is mailed while the deck is muted, and mail comes again once it is not",
    afterMute.map((mail) => mail.text),
  );

  const resolvedByGuest = await guest.fetch(`/api/decks/${id}/comments/${askedRow.id}/resolve`, {
    method: "POST",
  });
  const resolvedMail = await inbox.waitFor(me.email, guestEmail.split("@")[0] ?? "", 2);
  check(
    resolvedByGuest.status === 200 &&
      resolvedMail.some((mail) => mail.subject.includes(" resolved #")),
    "the owner is mailed when the guest resolves their thread",
    {
      status: resolvedByGuest.status,
      mails: (await inbox.to(me.email)).map((mail) => mail.subject),
    },
  );

  // Back to the team alone: a guest's grant opens the deck no more, the team's side's still does,
  // and only the owner's profile lists it.
  const toTeam = await dekc(["pub", "share", "--visibility", "team"]);
  check(toTeam.ok && toTeam.visibility === "team", "share keeps the deck to the team", toTeam);
  check(
    (await guest.fetch(talkPath)).status === 404 &&
      (await guest.fetch(`/api/decks/${id}/comments?status=all`)).status === 404,
    "a team deck is a 404 to a guest it is shared with, its threads too",
  );
  check((await stranger.fetch(talkPath)).status === 200, "the team's side opens a team deck");
  const profilePath = `/@${me.handle}`;
  const ownProfile = await (await author.fetch(`${profilePath}?lang=en`)).text();
  check(
    ownProfile.includes(`href="${talkPath}"`) && ownProfile.includes("Team only"),
    "the owner's profile lists the team deck with its badge",
  );
  check(
    !(await (await stranger.fetch(profilePath)).text()).includes(`href="${talkPath}"`),
    "nobody else's view of the profile lists it",
  );

  // The manage page shows the current version alone.
  const manage = await (await author.fetch(`${talkPath}/manage?lang=en`)).text();
  check(
    manage.includes("Current version") &&
      manage.includes("v2") &&
      manage.includes("renamed") &&
      !manage.includes("Make current"),
    "the manage page shows the current version, and no other to make current",
  );

  // A publish cut short after it took its number holds nothing: the next one skips that number,
  // and sweeps what it left with every other version below the new one.
  const { store } = server;
  const versionKeys = async () =>
    (await store.keys(`decks/${id}/v/`)).map((key) => Number(key.split("/")[3]));
  const versionRows = async () =>
    (await store.sql("select n from versions where deck_id = ? order by n", [id])).map(([n]) => n);
  const onlyVersion = async (n: number) => {
    const keys = await versionKeys();
    return keys.length > 0 && keys.every((m) => m === n) && (await versionRows()).join() === `${n}`;
  };
  check(await onlyVersion(2), "R2 and D1 hold the current version alone", {
    keys: await versionKeys(),
    rows: await versionRows(),
  });
  const [claimed] = await store.sql(
    "update decks set latest_version = latest_version + 1 where id = ? returning latest_version",
    [id],
  );
  const cutShort = Number(claimed?.[0]);
  await store.put(`decks/${id}/v/${cutShort}/full.html`, "cut short");
  await store.put(`decks/${id}/v/1/full.html`, "left behind");
  const afterCut = await dekc(["pub", "publish", "-m", "after a publish cut short"]);
  check(
    afterCut.ok && afterCut.n === cutShort + 1 && afterCut.current === cutShort + 1,
    "a publish cut short after its claim only skips a number",
    { afterCut, cutShort },
  );
  check(
    await eventually(() => onlyVersion(cutShort + 1)),
    "the next publish sweeps every version below it, a cut-short one's files too",
    { keys: await versionKeys(), rows: await versionRows() },
  );

  // Two publishes on the same version: both pass the first check, and the one that records second
  // is refused at the record, leaving no row, rename or file of its own.
  const twin = mkdtempSync(join(tmpdir(), "dek-pub-e2e-twin-"));
  try {
    const moving = (await slideMapOf(author, id)).find((slide) => slide.slug !== renamed)?.slug;
    check(moving !== undefined, "the deck has another slide to rename");
    const moved = await dekc(["mv", moving, `${moving}-raced`]);
    check(moved.ok, "dekc mv renames a slide before the race", moved);
    cpSync(work, twin, {
      recursive: true,
      filter: (path) => !/\/(node_modules|dist|\.cache)(\/|$)/.test(path),
    });
    const credentials = (await Bun.file(join(config, "credentials.json")).json()) as {
      keys: Record<string, string>;
    };
    const proxy = startRace(server.url);
    try {
      const asTwin = {
        server: proxy.url,
        env: { DEK_TOKEN: credentials.keys[server.url] ?? "", DEK_TOKEN_SERVER: proxy.url },
      };
      const raced = await Promise.all([
        dekc(["pub", "publish", "-m", "one"], join(work, "decks", "why-dek"), asTwin),
        dekc(["pub", "publish", "-m", "two"], join(twin, "decks", "why-dek"), asTwin),
      ]);
      const won = raced.filter((result) => result.ok);
      const lost = proxy.answers.find((answer) => answer.status === 409);
      const winner = Number(won[0]?.n);
      const [[latest]] = (await store.sql("select latest_version from decks where id = ?", [
        id,
      ])) as [[number]];
      check(
        won.length === 1 &&
          lost?.code === "stale_base" &&
          lost.message === "another version was published at the same moment",
        "of two publishes on one base, the second to record is refused",
        { raced, answers: proxy.answers },
      );
      check(
        latest === afterCut.n + 2 && winner > Number(afterCut.n),
        "each of the two had claimed a number of its own",
        { latest, winner },
      );
      const renameRows = await store.sql(
        "select n from renames where deck_id = ? and to_slug = ?",
        [id, `${moving}-raced`],
      );
      check(
        renameRows.length === 1 && renameRows[0]?.[0] === winner,
        "the rename is recorded once, with the version that won",
        renameRows,
      );
      check(
        await eventually(() => onlyVersion(winner)),
        "the refused publish leaves no row or file, and the winner sweeps the rest",
        { keys: await versionKeys(), rows: await versionRows(), winner },
      );
    } finally {
      proxy.stop();
    }
  } finally {
    rmSync(twin, { recursive: true, force: true });
  }

  // A grant by address to someone whose account has that address verified is theirs at once.
  const guestGrant = (await grantees()).find((row) => row.who === guestMe.handle);
  await author.fetch(`/api/decks/${id}/grants/${guestGrant?.id}`, { method: "DELETE" });
  const regranted = await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: { who: guestEmail, role: "comment" },
  });
  const regrantedRow = (await regranted.json()) as { who?: string };
  check(
    regranted.status === 201 &&
      regrantedRow.who === guestMe.handle &&
      (await grantees()).some((row) => row.who === guestMe.handle),
    "a grant by an address an account has verified is tied to that account when it is made",
    regrantedRow,
  );
  const tied = (await grantees()).find((row) => row.who === guestMe.handle);
  await author.fetch(`/api/decks/${id}/grants/${tied?.id}`, { method: "DELETE" });
  await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: { who: `@${guestMe.handle}`, role: "view", side: "team" },
  });
  const beside = await author.fetch(`/api/decks/${id}/grants`, {
    method: "POST",
    json: { who: guestEmail, role: "comment" },
  });
  const besideRow = (await beside.json()) as { who?: string };
  const both = await grantees();
  check(
    beside.status === 201 &&
      besideRow.who === guestEmail &&
      both.some((row) => row.who === guestMe.handle) &&
      both.some((row) => row.who === guestEmail) &&
      (await guest.fetch(talkPath)).status === 200,
    "a grant by address beside one by handle on the same deck waits, and the one by handle counts",
    { besideRow, both },
  );

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

/** Whether `condition` comes true within a few seconds, as work done after an answer does. */
async function eventually(condition: () => Promise<boolean>): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await condition()) {
      return true;
    }
    await Bun.sleep(100);
  }
  return false;
}

/**
 * A server in front of dek.pub that holds each version upload until a second one arrives, then
 * sends both on at once, so two publishes made on the same version race to record. It keeps what
 * the server answered each upload, with the number the upload was given in its error.
 */
function startRace(target: string): {
  url: string;
  answers: Array<{ status: number; code?: string; message?: string }>;
  stop(): void;
} {
  const waiting: Array<() => void> = [];
  const answers: Array<{ status: number; code?: string; message?: string }> = [];
  const proxy = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url);
      const upload = request.method === "POST" && url.pathname.endsWith("/versions");
      const body = request.method === "GET" ? undefined : await request.arrayBuffer();
      if (upload) {
        await new Promise<void>((go) => {
          waiting.push(go);
          if (waiting.length === 2) {
            for (const each of waiting) {
              each();
            }
          }
        });
      }
      const headers = new Headers(request.headers);
      headers.delete("host");
      const response = await fetch(`${target}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
      });
      const bytes = await response.arrayBuffer();
      if (upload) {
        const answer = JSON.parse(new TextDecoder().decode(bytes)) as {
          error?: { code: string; message: string };
        };
        answers.push({
          status: response.status,
          code: answer.error?.code,
          message: answer.error?.message,
        });
      }
      const back = new Headers(response.headers);
      back.delete("content-encoding");
      back.delete("content-length");
      return new Response(bytes, { status: response.status, headers: back });
    },
  });
  return { url: `http://localhost:${proxy.port}`, answers, stop: () => proxy.stop(true) };
}

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
