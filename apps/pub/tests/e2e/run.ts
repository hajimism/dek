// The phase 1 and 2 round trip, end to end, on Miniflare: the real `dekc pub` against `vp dev`.
// An author signs in with the device flow, publishes a sample deck, shares it; a colleague
// comments on a quoted sentence and on a slide element; the author reads the comments as JSON,
// renames the slide with `dekc mv`, publishes again, and resolves every comment from the CLI.
// At the end the author deletes the talk with all on it, and an operator takes one down; the
// author lists and revokes their CLI keys, and `dekc pub logout --all` revokes the rest.
// Run from apps/pub: `bun run test:e2e`.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { translate } from "../../src/common/i18n.ts";
import { addressOf, Browser, Inbox, startDevServer } from "./server.ts";

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
// dek.pub opens by invitation: the server lets sign up the people the run signs up, by address,
// and anyone a deck is shared with. "Form" is on the list for the development form to be refused.
// Keeper runs the server, as an operator who may take any talk down: named by address, and on no
// invitation list, as the first operator of a new database is. "Host" shares a deck with as many
// as dek.pub mails invitations for, and one more.
const server = await startDevServer(
  PORT,
  ["Author", "Stranger", "Reader", "Speaker", "Invitee", "Form", "Host"].map(addressOf),
  [addressOf("Keeper")],
);
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
  // A new account chooses its handle first, on the way to /device and back.
  const author = new Browser(server.url);
  const registered = await author.register("Author");
  const pending = await dekc(["pub", "login"]);
  check(
    pending.ok && pending.status === "pending" && typeof pending.code === "string",
    "login --json gives a code to show",
    pending,
  );
  const deviceUrl = new URL(String(pending.url));
  const devicePath = deviceUrl.pathname + deviceUrl.search;
  const toWelcome = await author.fetch(devicePath);
  check(
    toWelcome.status === 302 &&
      toWelcome.headers.get("location") === `/welcome?next=${encodeURIComponent(devicePath)}`,
    "a new account opening /device is sent to choose a handle first, with the way back",
    { status: toWelcome.status, location: toWelcome.headers.get("location") },
  );
  const welcomePage = await author.fetch(toWelcome.headers.get("location") ?? "");
  check(
    welcomePage.status === 200 &&
      (await welcomePage.text()).includes(`value="${registered.email.split("@")[0]}"`),
    "the page to choose a handle offers the address's local part",
  );
  const keyless = await author.fetch("/api/cli/key", { method: "POST" });
  check(
    keyless.status === 409 &&
      ((await keyless.json()) as { error: { code: string } }).error.code === "handle_needed",
    "an account with no handle gets no API key: handle_needed",
  );
  const reserved = await author.fetch("/api/handles/Admin");
  const reservedChoice = await author.chooseHandle("admin");
  check(
    ((await reserved.json()) as { status: string }).status === "reserved" &&
      reservedChoice.status === 422 &&
      ((await reservedChoice.json()) as { error: { code: string } }).error.code ===
        "handle_reserved",
    "a reserved handle is refused",
  );
  const chosen = await author.chooseHandle("Author");
  const me = { ...registered, ...((await chosen.json()) as { handle: string }) };
  check(chosen.status === 200 && me.handle === "author", "the author chooses @author", me);
  const twice = await author.chooseHandle("author-2");
  check(
    twice.status === 409 &&
      ((await twice.json()) as { error: { code: string } }).error.code === "handle_chosen",
    "a handle is chosen once, and cannot be changed",
  );
  const onward = await author.fetch(toWelcome.headers.get("location") ?? "");
  check(
    onward.status === 302 &&
      onward.headers.get("location") === devicePath &&
      (await author.fetch(devicePath)).status === 200,
    "with a handle chosen, the welcome page goes back to /device, which now opens",
    { status: onward.status, location: onward.headers.get("location") },
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
  const strangerAccount = await stranger.register("Stranger");
  const takenStatus = await stranger.fetch("/api/handles/author");
  const takenChoice = await stranger.chooseHandle("Author");
  check(
    ((await takenStatus.json()) as { status: string }).status === "taken" &&
      takenChoice.status === 409 &&
      ((await takenChoice.json()) as { error: { code: string } }).error.code === "handle_taken",
    "a handle someone holds is refused, in any case",
  );
  const strangerChoice = await stranger.chooseHandle("stranger");
  const strangerMe = {
    ...strangerAccount,
    ...((await strangerChoice.json()) as { handle: string }),
  };
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
  const sharedUrl = new URL(String((shared as { url?: string }).url));
  let linkKey = sharedUrl.searchParams.get("key") ?? "";
  check(
    sharedUrl.pathname === talkPath && /^[0-9a-z]{26}$/.test(linkKey),
    "a link deck's URL is its path with a key that cannot be guessed",
    shared,
  );
  /** `path` with the link key, as the URL and the talk page's own requests carry it. */
  const keyedPath = (path: string) => `${path}${path.includes("?") ? "&" : "?"}key=${linkKey}`;
  check(
    (await stranger.fetch(talkPath)).status === 404 &&
      (await stranger.fetch(`${talkPath}?key=${"0".repeat(26)}`)).status === 404 &&
      (await stranger.fetch(`${talkPath}?key=${linkKey.slice(1)}`)).status === 404,
    "a link talk is a 404 to someone with no grant, without its key or with a wrong one",
  );
  check(
    (await author.fetch(talkPath)).status === 200,
    "the owner opens a link talk without its key",
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
  const page = await stranger.fetch(keyedPath(talkPath));
  const html = await page.text();
  check(page.status === 200, "the talk page answers anyone with the link");
  check(
    html.includes(`<link rel="canonical" href="${server.url}${talkPath}"`) &&
      html.includes(`<meta property="og:url" content="${server.url}${talkPath}"`),
    "a link talk names its URL without the key as canonical and in its preview",
  );
  const preview = /<meta property="og:image" content="([^"]+)"/
    .exec(html)?.[1]
    ?.replace(/&amp;/g, "&");
  const picture = preview ? new URL(preview) : null;
  const bareImage = picture?.pathname ?? "";
  check(
    picture?.searchParams.get("key") === linkKey && bareImage.startsWith(`/i/${id}/`),
    "a link talk's preview picture carries its key",
    preview,
  );
  check(
    (await new Browser(server.url).fetch(bareImage)).status === 404 &&
      (await stranger.fetch(bareImage)).status === 404 &&
      (await new Browser(server.url).fetch(keyedPath(bareImage))).status === 200,
    "a link talk's pictures, found by its deck ID, need its key too",
  );
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
    invited.length === 1 &&
      invited[0]?.text.split(/\r?\n/).includes(`${server.url}${talkPath}`) &&
      !invited[0].text.includes("key="),
    "a new grant mails the colleague a link to the talk without its key, which their grant makes needless",
    invited,
  );
  check(
    (await stranger.fetch(talkPath)).status === 200,
    "a colleague granted a link talk opens it without its key",
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
    told.some(
      (mail) =>
        mail.text.includes("出典がほしい") &&
        mail.text.includes(`${server.url}${talkPath}#`) &&
        !mail.text.includes("key="),
    ),
    "the owner is mailed of a new thread, with its words and a link to it without the key",
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
          url: string;
        }>;
      }
    ).comments ?? [];
  check(listed.ok && rows.length === 2, "dekc pub comments lists both", listed);
  check(
    rows.every((row) => row.url === `${server.url}${talkPath}#${row.id}`),
    "a review thread's URL is the talk's without its key, so pasting it gives the key away nowhere",
    rows.map((row) => row.url),
  );
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
  const publicBare = `/api/decks/${id}/public-comments`;
  check(
    (await reader.fetch(publicBare)).status === 404 &&
      (await reader.fetch(publicBare, { method: "POST", json: { text: "x" } })).status === 404 &&
      (await reader.fetch(`/api/decks/${id}/like`, { method: "PUT" })).status === 404,
    "the public comments and likes of a link talk, found by its deck ID, need its key",
  );
  const publicPath = keyedPath(publicBare);
  const review = await reader.fetch(keyedPath(`/api/decks/${id}/comments`), {
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
  const edited = await reader.fetch(keyedPath(`${publicBare}/${postedRow.id}`), {
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
      await stranger.fetch(keyedPath(`${publicBare}/${postedRow.id}`), {
        method: "PATCH",
        json: { text: "x" },
      })
    ).status === 403,
    "no one else changes it",
  );
  check(
    (await author.fetch(keyedPath(`${publicBare}/${postedRow.id}`), { method: "DELETE" }))
      .status === 200 && (await publicList(reader)).length === 0,
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
  const likePath = keyedPath(`/api/decks/${id}/like`);
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

  // A new link: the URL given out before opens the talk no more.
  const oldLink = keyedPath(talkPath);
  const renewed = await dekc(["pub", "share", "--new-link"]);
  const newKey = new URL(String((renewed as { url?: string }).url)).searchParams.get("key") ?? "";
  check(
    renewed.ok && /^[0-9a-z]{26}$/.test(newKey) && newKey !== linkKey,
    "share --new-link gives the deck a new key",
    renewed,
  );
  linkKey = newKey;
  check(
    (await reader.fetch(oldLink)).status === 404 &&
      (await reader.fetch(keyedPath(talkPath))).status === 200 &&
      (await reader.fetch(publicPath)).status === 404 &&
      (await reader.fetch(keyedPath(publicBare))).status === 200,
    "the new link opens the talk and its comments, and the old one no more",
  );

  // Grants: a private deck shared with one person by handle.
  await dekc(["pub", "share", "--visibility", "private"]);
  check(
    (await reader.fetch(talkPath)).status === 404 &&
      (await reader.fetch(keyedPath(talkPath))).status === 404,
    "back to private, the talk is a 404 again to anyone not granted it, its key included",
  );
  const relinked = await dekc(["pub", "share", "--visibility", "link"]);
  check(
    (relinked as { url?: string }).url === `${server.url}${keyedPath(talkPath)}`,
    "back to link, the talk opens at the URL it had",
    relinked,
  );
  await dekc(["pub", "share", "--visibility", "private"]);
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
  // Shared twice at once, as by two clicks: it takes one number, not two.
  const [widened, widenedAgain] = await Promise.all(
    [0, 1].map(() =>
      author.fetch(`/api/decks/${id}/comments/${teamRow.id}/widen`, { method: "POST" }),
    ),
  );
  const widenedRow = (await widened.json()) as { scope: string; number: number };
  const shownToGuest = (await guestList()).comments?.find((row) => row.id === teamRow.id);
  const lastShared = Math.max(...rows.map((row) => row.number));
  check(
    widened.status === 200 &&
      widenedAgain.status === 200 &&
      widenedRow.scope === "shared" &&
      shownToGuest?.number === lastShared + 1,
    "a shared team thread reaches the guest under the next shared number",
    { widenedRow, shownToGuest },
  );
  const nextShared = (await (
    await author.fetch(`/api/decks/${id}/comments`, {
      method: "POST",
      json: {
        anchor: { slug: renamed, step: "0", targets: [] },
        text: "ゲストにも",
        scope: "shared",
      },
    })
  ).json()) as { number: number };
  check(
    nextShared.number === lastShared + 2,
    "sharing a thread twice at once takes one number",
    nextShared,
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
  const guestLocal = guestEmail.split("@")[0] ?? "";
  const grantees = async () =>
    (
      (await (await author.fetch(`/api/decks/${id}/grants`)).json()) as {
        grants: Array<{ id: string; who: string }>;
      }
    ).grants;
  const [claimedRow] = await server.store.sql("SELECT user_id FROM grants WHERE email = ?", [
    guestEmail,
  ]);
  const listedBefore = await grantees();
  check(
    typeof claimedRow?.[0] === "string" && listedBefore.some((row) => row.who === guestEmail),
    "signing in by the link claims the grant waiting on the address, listed by it until a handle is chosen",
    { claimedRow, listedBefore },
  );
  const guestAsked = await guest.fetch(talkPath);
  check(
    guestAsked.status === 302 &&
      guestAsked.headers.get("location") === `/welcome?next=${encodeURIComponent(talkPath)}` &&
      (await guest.fetch("/api/me")).status === 409,
    "a guest new to dek.pub chooses a handle before the talk opens",
    { status: guestAsked.status, location: guestAsked.headers.get("location") },
  );
  const guestChosen = await guest.chooseHandle(guestLocal);
  const guestMe = (await guestChosen.json()) as { name?: string; handle?: string };
  check(
    guestChosen.status === 200 && guestMe.name === guestLocal && guestMe.handle === guestLocal,
    "an account made by a sign-in link goes by its address's local part, and may take it as its handle",
    guestMe,
  );
  const claimedGrants = await grantees();
  check(
    claimedGrants.some((row) => row.who === guestMe.handle) &&
      !claimedGrants.some((row) => row.who === guestEmail),
    "once the guest has a handle, the grant they claimed is listed by it",
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

  // Sign-up is by invitation. The guest above got in by the share waiting on their address. An
  // address on the list gets in by a link with nothing shared. One whose share was taken back
  // before they followed their link is sent to /signin and told why, and the development form,
  // which verifies no address, makes no account even for one on the list. Signing in to an
  // account is never refused, whether or not anything would let it in now.
  const invitee = new Browser(server.url);
  const inviteeAccount = await invitee.register("Invitee");
  check(
    inviteeAccount.email === addressOf("Invitee") &&
      (await invitee.fetch("/api/me")).status === 409,
    "an address dek.pub invited signs up by a link, with nothing shared with it",
    inviteeAccount,
  );
  const late = `late-${Date.now()}@example.com`;
  const lateGrant = (await (
    await author.fetch(`/api/decks/${id}/grants`, {
      method: "POST",
      json: { who: late, role: "comment" },
    })
  ).json()) as { id: string };
  const latecomer = new Browser(server.url);
  await latecomer.fetch("/api/auth/sign-in/magic-link", {
    method: "POST",
    json: { email: late, callbackURL: talkPath, errorCallbackURL: "/signin" },
  });
  const lateLink = /https?:\/\/\S+\/magic-link\/verify\S+/.exec(
    (await inbox.waitFor(late, "Sign in"))[0]?.text ?? "",
  )?.[0];
  check(lateLink !== undefined, "an address a share waits for is mailed a sign-in link");
  await author.fetch(`/api/decks/${id}/grants/${lateGrant.id}`, { method: "DELETE" });
  const lateFollowed = await latecomer.fetch(new URL(lateLink).pathname + new URL(lateLink).search);
  const refusedTo = new URL(lateFollowed.headers.get("location") ?? "/", server.url);
  const refusedPage = await (await latecomer.fetch(refusedTo.pathname + refusedTo.search)).text();
  const pageLang = /<html lang="ja"/.test(refusedPage) ? "ja" : "en";
  const lateAccounts = await server.store.sql("SELECT id FROM user WHERE email = ?", [late]);
  const lateMe = (await latecomer.fetch("/api/me")).status;
  check(
    lateFollowed.status === 302 &&
      refusedTo.pathname === "/signin" &&
      refusedTo.searchParams.get("error") === "not_invited" &&
      refusedPage.includes(translate(pageLang, "signin.notInvited")) &&
      lateAccounts.length === 0 &&
      lateMe === 401,
    "a link to an address nothing lets in any more makes no account, and /signin says it is by invitation",
    { status: lateFollowed.status, location: refusedTo.href, lateAccounts, lateMe },
  );
  const formed = await new Browser(server.url).fetch("/api/auth/sign-up/email", {
    method: "POST",
    json: { email: addressOf("Form"), password: "password-1234", name: "Form" },
  });
  check(
    formed.status === 403 && ((await formed.json()) as { code?: string }).code === "not_invited",
    "the development form makes no account for an address on the list, as it verifies none",
    formed.status,
  );
  const guestAgain = new Browser(server.url);
  const backTo = await guestAgain.signInByLink(guestEmail, {
    callbackURL: talkPath,
    errorCallbackURL: "/signin",
  });
  check(
    backTo.endsWith(talkPath) &&
      ((await (await guestAgain.fetch("/api/me")).json()) as { handle?: string }).handle ===
        guestMe.handle,
    "the guest, not on the list and with no share waiting, signs in again by a link",
    backTo,
  );

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
  // The footer links to dek's repository; the profile's own link says it is the person's, rel="me".
  check(
    !/href="https:\/\/github\.com\/[^"]*" rel="me/.test(ownProfile),
    "a profile of an account made without GitHub links to no GitHub account",
  );

  // A person sets the links their profile shows, and their name, on /settings.
  const settingsAway = await new Browser(server.url).fetch("/settings");
  check(
    settingsAway.status === 302 &&
      settingsAway.headers.get("location") === `/signin?next=${encodeURIComponent("/settings")}`,
    "the settings page sends a visitor signed out to sign in, and back",
    { status: settingsAway.status, location: settingsAway.headers.get("location") },
  );
  const speaker = new Browser(server.url);
  const speakerMe = await speaker.signUp("Speaker");
  const settingsPage = await speaker.fetch("/settings?lang=en");
  const settingsHtml = await settingsPage.text();
  check(
    settingsPage.status === 200 &&
      settingsHtml.includes(`@${speakerMe.handle}`) &&
      settingsHtml.includes("No links yet."),
    "the settings page shows the handle, and no links for an account made without GitHub",
  );
  const refusedLinks = async (links: string[]) => {
    const response = await speaker.fetch("/api/me/links", { method: "PUT", json: { links } });
    const body = (await response.json()) as { error?: { code: string } };
    return `${response.status} ${body.error?.code}`;
  };
  const six = ["a", "b", "c", "d", "e", "f"].map((host) => `https://${host}.example/`);
  check(
    (await refusedLinks(["http://speaker.example"])) === "422 link_not_https" &&
      (await refusedLinks(["https://me:pw@speaker.example"])) === "422 link_credentials" &&
      (await refusedLinks(["javascript:alert(1)"])) === "422 link_not_https" &&
      (await refusedLinks(six)) === "422 links_too_many",
    "a link that is not https, carries a password, or one too many is refused with its code",
  );
  const setLinks = await speaker.fetch("/api/me/links", {
    method: "PUT",
    json: {
      links: ["zenn.dev/speaker", "https://GitHub.com/speaker-gh", "https://speaker.example/talks"],
    },
  });
  const savedLinks = (await setLinks.json()) as { links: string[] };
  const ordered = [
    "https://zenn.dev/speaker",
    "https://github.com/speaker-gh",
    "https://speaker.example/talks",
  ];
  check(
    setLinks.status === 200 && savedLinks.links.join() === ordered.join(),
    "PUT /api/me/links answers the links as saved, written out",
    savedLinks,
  );
  check(
    ((await (await speaker.fetch("/api/me/links")).json()) as { links: string[] }).links.join() ===
      ordered.join(),
    "GET /api/me/links answers them in their order",
  );
  const speakerProfile = await (await stranger.fetch(`/@${speakerMe.handle}?lang=en`)).text();
  const at = ordered.map((url) =>
    speakerProfile.indexOf(`href="${url}" rel="me nofollow ugc noopener"`),
  );
  check(
    at.every((index, n) => index > 0 && (n === 0 || index > (at[n - 1] ?? 0))) &&
      speakerProfile.includes("Zenn") &&
      speakerProfile.includes("speaker.example"),
    'the profile shows each link in its order, rel="me nofollow ugc noopener", named by its service or site',
    at,
  );
  const newName = await speaker.fetch("/api/me", {
    method: "PATCH",
    json: { name: "  Speaker   K " },
  });
  const emptyName = await speaker.fetch("/api/me", { method: "PATCH", json: { name: " " } });
  check(
    newName.status === 200 &&
      ((await newName.json()) as { name: string }).name === "Speaker K" &&
      emptyName.status === 422 &&
      ((await emptyName.json()) as { error: { code: string } }).error.code === "name_empty" &&
      (await (await stranger.fetch(`/@${speakerMe.handle}`)).text()).includes("Speaker K"),
    "a person changes their name with PATCH /api/me, and an empty one is refused",
  );
  check(
    (await speaker.fetch("/api/me/links", { method: "PUT", json: { links: [] } })).status === 200 &&
      !(await (await stranger.fetch(`/@${speakerMe.handle}`)).text()).includes('rel="me'),
    "a person may take every link off their profile",
  );
  check(
    !(await (await stranger.fetch(profilePath)).text()).includes(`href="${talkPath}"`),
    "nobody else's view of the profile lists it",
  );
  const feed = await stranger.fetch(`${profilePath}/rss`);
  const feedText = await feed.text();
  check(
    feed.status === 200 &&
      feed.headers.get("content-type")?.startsWith("application/rss+xml") &&
      feedText.includes(`<link>${server.url}${profilePath}</link>`) &&
      !feedText.includes(talkPath),
    "the profile's feed is RSS on the app's origin, without the team deck",
    feedText.slice(0, 400),
  );
  check(
    (await stranger.fetch("/@nobody-here/rss")).status === 404,
    "a feed for a handle no one has is a 404",
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

  // The CLI shares the deck as the manage page does, and stops.
  const cliGuest = `cli-${Date.now()}@example.com`;
  type GrantRow = { id: string; who: string; role: string; side: string };
  const added = (await dekc(["pub", "grants", "add", cliGuest, "--side", "team"])) as {
    ok: boolean;
    grant?: GrantRow;
    invited?: boolean;
  };
  check(
    added.ok &&
      added.invited === true &&
      added.grant?.role === "view" &&
      added.grant.side === "team" &&
      (await inbox.waitFor(cliGuest, "shared")).length === 1,
    "dekc pub grants add shares the deck, a viewer unless --role says otherwise, and mails them",
    added,
  );
  const cliGrants = async () =>
    ((await dekc(["pub", "grants"])) as { grants?: GrantRow[] }).grants ?? [];
  check(
    (await cliGrants()).some((row) => row.who === cliGuest && row.side === "team"),
    "dekc pub grants lists the grant",
  );
  const removed = await dekc(["pub", "grants", "remove", cliGuest]);
  check(
    removed.ok && !(await cliGrants()).some((row) => row.who === cliGuest),
    "dekc pub grants remove stops sharing the deck",
    removed,
  );

  // An owner's new shares mail at most 20 invitations a day, by handle or by address, and a share
  // removed and made again mails again, so it counts again. Past the limit a new share is
  // refused with when the next may go, from the page's API and from the CLI alike; a change to a
  // share still works, and deleting the deck frees nothing.
  const inviter = new Browser(server.url);
  const hostMe = await inviter.signUp("Host");
  const newDeck = async (slug: string) =>
    (
      (await (
        await inviter.fetch("/api/decks", {
          method: "POST",
          json: { slug, title: `Limits ${slug}` },
        })
      ).json()) as { id: string }
    ).id;
  const hostDeck = await newDeck("limits");
  const shareWith = (deckId: string, who: string, role?: string) =>
    inviter.fetch(`/api/decks/${deckId}/grants`, {
      method: "POST",
      json: { who, ...(role ? { role } : {}) },
    });
  const stamp = Date.now();
  const byAddress = Array.from({ length: 19 }, (_, i) => `limit-${i}-${stamp}@example.com`);
  const statuses: number[] = [];
  for (const who of ["@reader", ...byAddress.slice(0, 18)]) {
    statuses.push((await shareWith(hostDeck, who)).status);
  }
  check(
    statuses.every((status) => status === 201) &&
      (await inbox.waitFor(addressOf("Reader"), "Limits limits")).length === 1 &&
      (await inbox.waitFor(byAddress[17] ?? "", "Limits limits")).length === 1,
    "an owner shares a deck with 19 people, one by handle, and each is mailed",
    statuses,
  );
  const reshared = byAddress[0] ?? "";
  const hostGrants = async (deckId: string) =>
    (
      (await (await inviter.fetch(`/api/decks/${deckId}/grants`)).json()) as {
        grants: { id: string; who: string }[];
      }
    ).grants;
  const toRemove = (await hostGrants(hostDeck)).find((row) => row.who === reshared);
  await inviter.fetch(`/api/decks/${hostDeck}/grants/${toRemove?.id}`, { method: "DELETE" });
  const readded = await shareWith(hostDeck, reshared);
  check(
    readded.status === 201 && (await inbox.waitFor(reshared, "Limits limits", 2)).length === 2,
    "a share removed and made again mails again: the twentieth invitation",
  );
  const over = byAddress[18] ?? "";
  const overLimit = await shareWith(hostDeck, over);
  const overBody = (await overLimit.json()) as {
    error?: { code: string; message: string; hint?: string };
  };
  check(
    overLimit.status === 429 &&
      overBody.error?.code === "invitations_exhausted" &&
      overBody.error.message.includes("20 invitations in the last 24 hours") &&
      /after \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/.test(overBody.error.hint ?? "") &&
      !(await hostGrants(hostDeck)).some((row) => row.who === over) &&
      (await inbox.to(over)).length === 0,
    "the twenty-first is refused with a 429 that says when the next may go, and is not made",
    overBody,
  );
  check(
    (await shareWith(hostDeck, `@${speakerMe.handle}`)).status === 429,
    "a share by handle mails too, so it is refused as well",
  );
  const changed = await shareWith(hostDeck, reshared, "comment");
  check(
    changed.status === 201 && ((await changed.json()) as { role: string }).role === "comment",
    "a change to a share mails nothing, so it still works",
  );
  const hostKey = (
    (await (await inviter.fetch("/api/cli/key", { method: "POST" })).json()) as { key: string }
  ).key;
  const hostWork = mkdtempSync(join(tmpdir(), "dek-pub-e2e-host-"));
  try {
    cpSync(join(REPO, "sample"), hostWork, {
      recursive: true,
      filter: (path) => !/\/(node_modules|dist|\.cache)(\/|$)/.test(path),
    });
    const hostScript = join(hostWork, "decks", "why-dek", "script.md");
    writeFileSync(
      hostScript,
      readFileSync(hostScript, "utf8").replace(/^---\n/, `---\npub: ${hostDeck}\n`),
    );
    const cliRefused = await dekc(
      ["pub", "grants", "add", over],
      join(hostWork, "decks", "why-dek"),
      {
        env: { DEK_TOKEN: hostKey, DEK_TOKEN_SERVER: server.url },
      },
    );
    const cliError = cliRefused.error as { message?: string; hint?: string } | undefined;
    check(
      cliRefused.ok === false &&
        String(cliError?.message).includes("20 invitations") &&
        /after .* UTC/.test(String(cliError?.hint)),
      "dekc pub grants add prints the refusal and, as its hint, when the next may go",
      cliRefused,
    );
  } finally {
    rmSync(hostWork, { recursive: true, force: true });
  }
  await inviter.fetch(`/api/decks/${hostDeck}`, { method: "DELETE" });
  const [[counted]] = (await server.store.sql(
    "select count(*) from invitations where inviter_id = ?",
    [hostMe.id],
  )) as [[number]];
  check(
    counted === 20 && (await shareWith(await newDeck("limits-reshared"), over)).status === 429,
    "deleting the deck keeps the invitations it mailed counted",
    { counted },
  );

  // The author deletes the talk: every row and file of it goes, nothing of it opens, and its slug
  // is free to publish again, as a new deck.
  await dekc(["pub", "share", "--visibility", "public"]);
  const deleting = (await dekc(["pub", "status"])) as Json & { current?: number };
  const n = Number(deleting.current);
  await reader.fetch(`/api/decks/${id}/public-comments`, { method: "POST", json: { text: "x" } });
  await reader.fetch(`/api/decks/${id}/like`, { method: "PUT" });
  const muted = await guest.fetch(`/api/decks/${id}/mute`, { method: "PUT" });
  // Every table with a deck_id column, as D1 has them, so a table added later is checked too.
  const deckTables = async () =>
    (await store.sql("select name, sql from sqlite_master where type = 'table'"))
      .filter(([, sql]) => /[`"\s(]deck_id[`"\s]/.test(String(sql)))
      .map(([name]) => String(name));
  const tables = await deckTables();
  const replyIds = (
    await store.sql(
      "select id from replies where thread_id in (select id from threads where deck_id = ?)",
      [id],
    )
  ).map(([reply]) => String(reply));
  const rowsOf = async (deckId: string) => {
    const counts: Record<string, number> = {};
    for (const table of tables) {
      const [[count]] = (await store.sql(`select count(*) from "${table}" where deck_id = ?`, [
        deckId,
      ])) as [[number]];
      counts[table] = count;
    }
    const [[deck]] = (await store.sql("select count(*) from decks where id = ?", [deckId])) as [
      [number],
    ];
    const [[replies]] = (await store.sql(
      `select count(*) from replies where id in (${replyIds.map(() => "?").join(",") || "''"})`,
      replyIds,
    )) as [[number]];
    return { ...counts, decks: deck, replies };
  };
  const before = await rowsOf(id);
  const cover = `/i/${id}/${n}/cover`;
  const version = `${server.deckOrigin(id)}/v/${n}/`;
  check(
    muted.status === 200 &&
      Object.values(before).every((count) => count > 0) &&
      tables.length === 7 &&
      (await author.fetch(cover)).status === 200 &&
      (await fetch(version)).status === 200,
    "before it is deleted, the talk has a row in every table keyed by deck, and is served",
    { before, tables },
  );
  for (const [who, name] of [
    [stranger, "a stranger"],
    [guest, "someone it is shared with"],
  ] as const) {
    check(
      (await who.fetch(`/api/decks/${id}`, { method: "DELETE" })).status === 404 &&
        (await author.fetch(talkPath)).status === 200,
      `${name} deleting the talk gets a 404, and the talk stays`,
    );
  }
  const unasked = await dekc(["pub", "delete"]);
  check(
    unasked.ok === false && (await author.fetch(talkPath)).status === 200,
    "dekc pub delete without --yes deletes nothing",
    unasked,
  );
  const deleted = await dekc(["pub", "delete", "--yes"]);
  const scriptPath = join(work, "decks", "why-dek", "script.md");
  check(
    deleted.ok &&
      deleted.action === "delete" &&
      deleted.id === id &&
      deleted.owner === me.handle &&
      deleted.slug === "why-dek" &&
      JSON.stringify(deleted.changed) === JSON.stringify(["script.md"]) &&
      !/^pub:/m.test(readFileSync(scriptPath, "utf8")),
    "dekc pub delete --yes deletes the talk and takes pub: out of script.md",
    deleted,
  );
  const left = await rowsOf(id);
  check(
    Object.values(left).every((count) => count === 0),
    "no row of the talk is left in D1",
    left,
  );
  check(
    (await store.keys(`decks/${id}/`)).length === 0,
    "no file of the talk is left in R2, its access file included",
  );
  const answers = await Promise.all([
    author.fetch(talkPath),
    author.fetch(`${talkPath}/manage`),
    author.fetch(cover),
    new Browser(server.url).fetch(cover),
    fetch(version),
    ...["", "/comments", "/grants", "/public-comments", "/mute"].map((rest) =>
      author.fetch(`/api/decks/${id}${rest}`),
    ),
    reader.fetch(`/api/decks/${id}/like`, { method: "PUT" }),
    author.fetch(`/api/decks/${id}`, { method: "DELETE" }),
  ]);
  check(
    answers.every((response) => response.status === 404),
    "the talk page, its pictures, its build on the deck's origin and every API route are 404",
    answers.map((response) => `${response.status} ${response.url}`),
  );
  const republished = await dekc(["pub", "publish", "-m", "again"]);
  check(
    republished.ok &&
      typeof republished.id === "string" &&
      republished.id !== id &&
      republished.url === `${server.url}${talkPath}` &&
      (await author.fetch(talkPath)).status === 200,
    "the slug is free: publishing again makes a new deck at the same URL",
    republished,
  );

  // An operator, whom only DEK_PUB_OPERATORS lets sign up, takes down someone else's talk, named
  // by its URL, from any directory.
  const keeper = new Browser(server.url);
  await keeper.signUp("Keeper");
  const keeperKey = (
    (await (await keeper.fetch("/api/cli/key", { method: "POST" })).json()) as {
      key: string;
    }
  ).key;
  const asKeeper = { env: { DEK_TOKEN: keeperKey, DEK_TOKEN_SERVER: server.url } };
  const takenDown = await dekc(
    ["pub", "takedown", String(republished.url), "--yes"],
    config,
    asKeeper,
  );
  check(
    takenDown.ok &&
      takenDown.action === "takedown" &&
      takenDown.id === republished.id &&
      takenDown.owner === me.handle &&
      (await author.fetch(talkPath)).status === 404 &&
      (await store.keys(`decks/${String(republished.id)}/`)).length === 0,
    "an operator takes the talk down with dekc pub takedown",
    takenDown,
  );
  const ownerAfter = await dekc(["pub", "status"]);
  check(
    ownerAfter.ok === false &&
      String((ownerAfter.error as { hint?: string }).hint).includes("take pub: out of script.md"),
    "its owner's next dekc pub status is a 404 that says to take pub: out",
    ownerAfter,
  );

  // The author's CLI keys: one for each dekc signed in, and one for CI. Each is listed on
  // /settings and can be revoked there; `dekc pub logout --all` revokes them all from any one.
  const keyIn = async (folder: string) =>
    String(
      (
        (await Bun.file(join(folder, "credentials.json")).json()) as {
          keys: Record<string, string>;
        }
      ).keys[server.url],
    );
  /** A call with an API key alone, as the CLI or a script makes one. */
  const keyed = (key: string, path: string, init: { method?: string; json?: unknown } = {}) =>
    fetch(`${server.url}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "x-api-key": key,
        ...(init.json === undefined ? {} : { "content-type": "application/json" }),
      },
      body: init.json === undefined ? undefined : JSON.stringify(init.json),
    });
  const laptopKey = await keyIn(config);
  const desk = mkdtempSync(join(tmpdir(), "dek-pub-e2e-desk-"));
  try {
    const atDesk = {
      env: { DEK_PUB_CREDENTIALS: join(desk, "credentials.json"), XDG_CONFIG_HOME: desk },
    };
    const deskPending = await dekc(["pub", "login"], config, atDesk);
    await author.approveDevice(String(deskPending.code));
    const deskIn = await dekc(["pub", "login"], config, atDesk);
    check(
      deskIn.ok && deskIn.status === "signed-in",
      "a second dekc signs in as the author",
      deskIn,
    );
    const deskKey = await keyIn(desk);
    const ciKey = (
      (await (await author.fetch("/api/cli/key", { method: "POST" })).json()) as { key: string }
    ).key;
    const asCi = { env: { DEK_TOKEN: ciKey, DEK_TOKEN_SERVER: server.url } };
    check((await dekc(["pub", "whoami"], config, asCi)).ok, "a key made for CI works as DEK_TOKEN");
    check(
      new Set([laptopKey, deskKey, ciKey]).size === 3,
      "each login, and the key for CI, is a key of its own",
    );

    type Listed = {
      id: string;
      name: string;
      createdAt: string;
      lastUsedAt: string | null;
      expiresAt: string;
    };
    const listedAnswer = await author.fetch("/api/me/keys");
    const listedText = await listedAnswer.text();
    const listed = (JSON.parse(listedText) as { keys: Listed[] }).keys;
    const host = hostname().split(".")[0];
    check(
      listedAnswer.status === 200 &&
        listed.map((key) => key.name).join() === ["dekc", host, host].join() &&
        listed[0]?.lastUsedAt !== null &&
        listed[1]?.lastUsedAt === null &&
        listed[2]?.lastUsedAt !== null &&
        listed.every(
          (key) =>
            Date.parse(key.expiresAt) - Date.parse(key.createdAt) > 364 * 24 * 60 * 60 * 1000,
        ),
      "GET /api/me/keys lists the three keys, newest first: CI's, then each machine's by its name",
      listed,
    );
    check(
      [laptopKey, deskKey, ciKey].every((key) => !listedText.includes(key.slice(0, 16))) &&
        !listedText.includes("dekpub_"),
      "the list holds no key, nor the start of one",
    );
    const settingsKeys = await (await author.fetch("/settings?lang=en")).text();
    check(
      settingsKeys.includes("CLI keys") &&
        settingsKeys.includes(String(host)) &&
        settingsKeys.includes("Revoke all"),
      "the settings page lists the CLI keys",
    );

    const deskListed = listed[1];
    const refused = await Promise.all([
      keyed(laptopKey, "/api/me/keys"),
      keyed(laptopKey, `/api/me/keys/${deskListed?.id}`, { method: "DELETE" }),
      keyed(laptopKey, "/api/me/links", { method: "PUT", json: { links: [] } }),
      keyed(laptopKey, "/api/me", { method: "PATCH", json: { name: "Stolen" } }),
    ]);
    const codes = await Promise.all(
      refused.map(async (response) => {
        const body = (await response.json()) as { error: { code: string } };
        return `${response.status} ${body.error.code}`;
      }),
    );
    check(
      codes.every((code) => code === "403 session_needed") &&
        (await keyed(laptopKey, "/api/me")).status === 200,
      "an API key may not list the keys, revoke another, or change the settings; it may read who it is",
      codes,
    );

    const revokedOne = await author.fetch(`/api/me/keys/${deskListed?.id}`, { method: "DELETE" });
    check(
      revokedOne.status === 200 &&
        ((await revokedOne.json()) as { revoked: number }).revoked === 1 &&
        (await keyed(deskKey, "/api/me")).status === 401 &&
        (await keyed(laptopKey, "/api/me")).status === 200 &&
        (await keyed(ciKey, "/api/me")).status === 200,
      "revoking one key on the settings page stops it, and leaves the others",
    );
    check(
      (await author.fetch(`/api/me/keys/${deskListed?.id}`, { method: "DELETE" })).status === 404,
      "a key revoked already is a 404, as one of another person's is",
    );
    const deskGone = await dekc(["pub", "whoami"], config, atDesk);
    check(!deskGone.ok, "the dekc whose key was revoked is refused", deskGone);

    const all = await dekc(["pub", "logout", "--all"]);
    check(
      all.ok && all.revoked === true && all.revokedKeys === 2 && all.forgotten === true,
      "logout --all revokes the account's two keys left, its own included, and forgets it",
      all,
    );
    check(
      (await keyed(laptopKey, "/api/me")).status === 401 &&
        (await keyed(ciKey, "/api/me")).status === 401 &&
        !(await dekc(["pub", "whoami"], config, asCi)).ok,
      "after logout --all neither the machine's key nor CI's DEK_TOKEN works",
    );
    check(
      ((await (await author.fetch("/api/me/keys")).json()) as { keys: unknown[] }).keys.length ===
        0 && (await author.fetch("/settings")).status === 200,
      "the account has no key left, and the browser's session stays signed in",
    );

    // A plain logout revokes the key it holds, and that one alone.
    const again = await dekc(["pub", "login"], config, atDesk);
    await author.approveDevice(String(again.code));
    check((await dekc(["pub", "login"], config, atDesk)).ok, "the second dekc signs in again");
    const logout = await dekc(["pub", "logout"], config, atDesk);
    check(logout.ok && logout.revoked === true, "logout revokes the key", logout);
    const gone = await dekc(["pub", "whoami"], config, atDesk);
    check(!gone.ok, "after logout the CLI is signed out", gone);
  } finally {
    rmSync(desk, { recursive: true, force: true });
  }
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
