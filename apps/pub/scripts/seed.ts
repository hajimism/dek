// Fills a running dek.pub dev server with demo data, the way `dekc pub` would: it builds the
// sample decks in ../../sample with dek's own core, takes one picture per slide with Playwright,
// signs up a demo author and a reviewer, publishes the decks with their versions, shares them,
// and leaves comments and replies on them. It can run again: the accounts sign in, each deck gets
// new versions on top of its newest, and comments already there are kept.
//
// Run from apps/pub, with the dev server up: `bun scripts/seed.ts`; BASE picks another server.

import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { renderDeckDocument } from "../../../src/core/document.ts";
import { lintDeck } from "../../../src/core/lint.ts";
import { pluginPages } from "../../../src/core/plugin-host.ts";
import { type Project, type ProjectDeck, resolveProject } from "../../../src/core/resolve.ts";
import { slideMap } from "../../../src/core/slide-map.ts";
import {
  type CommentAnchor,
  type CommentTarget,
  type DeckStatus,
  type LintSummary,
  PROTOCOL_VERSION,
  type PublishResult,
  paths,
  type ShareRequest,
  type SlideMap,
  shotField,
  type VersionManifest,
} from "../../../src/pub/protocol.ts";
import { playerScript, pluginPageScripts } from "../../../src/runtime/player.ts";

const BASE = (process.env.BASE ?? "http://localhost:5176").replace(/\/$/, "");
const REPO = join(import.meta.dir, "../../..");
const SAMPLE = join(REPO, "sample");
const DEK_VERSION = ((await Bun.file(join(REPO, "package.json")).json()) as { version: string })
  .version;
const VIEWPORT = { width: 1280, height: 720 };
/** The slide on the stage; the rail holds copies of every slide, which match `.is-current` too. */
const ON_STAGE = "#dek-current-stage #deck > section.slide.is-current";

const DEMO = {
  email: "demo@dek.pub.test",
  password: "demo-password-1234",
  name: "Hajime Nakagawa",
};
const REVIEWER = {
  email: "reviewer@dek.pub.test",
  password: "reviewer-password-1234",
  name: "Sato Yuki",
};

/** The sentence why-dek's second version tightens, in the cover slide's script. */
const INTRO = {
  slug: "cover",
  from: "今日は、dek というスライドの道具を紹介します。",
  to: "今日は、dek を紹介します。",
};

/** Bytes a form field can carry. */
type Bytes = Uint8Array<ArrayBuffer>;

// ---------------------------------------------------------------------------------------------
// HTTP: one cookie jar per person, and the origin header Better Auth checks on every request.

type Answer = { status: number; body: unknown };

class Session {
  readonly #cookies = new Map<string, string>();

  constructor(readonly who: string) {}

  async send(method: string, path: string, body?: unknown): Promise<Answer> {
    const headers = new Headers({ origin: BASE });
    if (this.#cookies.size > 0) {
      headers.set(
        "cookie",
        [...this.#cookies].map(([name, value]) => `${name}=${value}`).join("; "),
      );
    }
    let payload: BodyInit | undefined;
    if (body instanceof FormData) {
      payload = body;
    } else if (body !== undefined) {
      headers.set("content-type", "application/json");
      payload = JSON.stringify(body);
    }
    const response = await fetch(BASE + path, { method, headers, body: payload });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair = ""] = cookie.split(";");
      const at = pair.indexOf("=");
      this.#cookies.set(pair.slice(0, at), pair.slice(at + 1));
    }
    const text = await response.text();
    return { status: response.status, body: text ? parseJson(text) : null };
  }

  /** `send`, failing on anything but a 2xx answer. */
  async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const answer = await this.send(method, path, body);
    if (answer.status < 200 || answer.status > 299) {
      throw new Error(
        `${this.who}: ${method} ${path} answered ${answer.status}: ${JSON.stringify(answer.body)}`,
      );
    }
    return answer.body as T;
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorCode(answer: Answer): string | undefined {
  const body = answer.body as { error?: { code?: string } } | null;
  return body?.error?.code;
}

/** Signs up, or signs in when the account is there from an earlier run. */
async function signIn(account: typeof DEMO): Promise<{ session: Session; handle: string }> {
  const session = new Session(account.email);
  const signUp = await session.send("POST", "/api/auth/sign-up/email", account);
  if (signUp.status !== 200) {
    await session.call("POST", "/api/auth/sign-in/email", {
      email: account.email,
      password: account.password,
    });
  }
  const me = await session.call<{ handle: string }>("GET", paths.me);
  return { session, handle: me.handle };
}

// ---------------------------------------------------------------------------------------------
// Building: what `dekc build` writes, rendered in memory so nothing under sample/ changes.

type Build = {
  deck: ProjectDeck;
  full: string;
  public: string;
  /** The public build's map, as the server lays out the script article from it. */
  map: SlideMap;
  lint: LintSummary;
  source: Bytes;
};

/**
 * Renders a deck as `buildDeck` does, once for its author and once for the public. `buildDeck`
 * itself is not called: sample/dek.toml sets `url`, which would make it shoot a cover into the
 * sample's dist/ and point og: tags at GitHub Pages.
 */
async function buildDecks(project: Project, names: string[]): Promise<Map<string, Build>> {
  const script = await playerScript();
  const pluginScripts = await pluginPageScripts();
  const builds = new Map<string, Build>();
  for (const name of names) {
    const deck = project.decks.find((candidate) => candidate.name === name);
    if (!deck) {
      throw new Error(`sample has no deck ${name}`);
    }
    const render = (isPublic: boolean) =>
      renderDeckDocument(deck, {
        playerScript: script,
        plugins: pluginPages(project.root, deck.dir, pluginScripts),
        target: { kind: "build", ...(isPublic ? { public: true } : {}) },
      });
    builds.set(name, {
      deck,
      full: render(false),
      public: render(true),
      map: slideMap(deck, `${deck.name}.html`, "audience"),
      lint: lintSummary(project, deck),
      source: await sourceTar(deck),
    });
  }
  return builds;
}

function lintSummary(project: Project, deck: ProjectDeck): LintSummary {
  const diagnostics = lintDeck({ project, deck });
  return {
    errors: diagnostics.filter((diagnostic) => diagnostic.severity === "error").length,
    warnings: diagnostics.filter((diagnostic) => diagnostic.severity === "warning").length,
  };
}

/** The deck's own files as an uncompressed tar, the way the server checks one. */
async function sourceTar(deck: ProjectDeck): Promise<Bytes> {
  const entries: Record<string, Uint8Array> = {};
  for (const top of ["script.md", "theme.css", "slides", "assets"]) {
    for (const path of filesUnder(join(deck.dir, top))) {
      entries[`${deck.name}/${relative(deck.dir, path)}`] = readFileSync(path);
    }
  }
  return new Uint8Array(await new Bun.Archive(entries).bytes());
}

function filesUnder(path: string): string[] {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(path);
  } catch {
    return [];
  }
  if (!stat.isDirectory()) {
    return [path];
  }
  return readdirSync(path)
    .filter((name) => !name.startsWith("."))
    .sort()
    .flatMap((name) => filesUnder(join(path, name)));
}

// ---------------------------------------------------------------------------------------------
// Pictures: each slide with every beat shown, as `dekc pub publish` takes them, from the public
// build opened in Chromium.

type ElementTarget = Extract<CommentTarget, { kind: "element" }>;

type Shots = {
  pngs: Map<string, Bytes>;
  /** Each slide's heading as an element comment would point at it, in logical pixels. */
  headings: Map<string, ElementTarget>;
};

async function shootDeck(browser: Browser, build: Build, dir: string): Promise<Shots> {
  const file = join(dir, `${build.deck.name}.html`);
  await Bun.write(file, build.public);
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const slugs = build.map.slides.map((slide) => slide.slug);
  await page.goto(`${pathToFileURL(file).href}#${slugs[0]}`);
  await page.waitForSelector(ON_STAGE);
  // The rail and the key hint frame the stage; `s` hides the one and takes the other away.
  await page.keyboard.press("s");
  await page.waitForTimeout(400);
  await requireFullStage(page);

  const shots: Shots = { pngs: new Map(), headings: new Map() };
  for (const slide of build.map.slides) {
    const slug = slide.slug;
    // The hash names a beat by its number; the last is the count of beats.
    await showSlide(page, slug, slide.steps.length - 1);
    shots.pngs.set(slug, new Uint8Array(await page.screenshot({ type: "png" })));
    const heading = await headingOf(page, slug);
    if (heading) {
      shots.headings.set(slug, heading);
    }
  }
  await page.close();
  return shots;
}

async function requireFullStage(page: Page): Promise<void> {
  const box = await page.locator("#dek-current-stage").boundingBox();
  const fills =
    box?.x === 0 && box.y === 0 && box.width === VIEWPORT.width && box.height === VIEWPORT.height;
  if (!fills) {
    throw new Error(`the stage does not fill the window: ${JSON.stringify(box)}`);
  }
}

/** Goes to `slug` by its hash and waits until that slide is the current one and has settled. */
async function showSlide(page: Page, slug: string, beat = 0): Promise<void> {
  await page.evaluate((hash) => {
    location.hash = hash;
  }, beat > 0 ? `#${slug}/${beat}` : `#${slug}`);
  try {
    await page.waitForFunction(
      ({ selector, want }) => document.querySelector<HTMLElement>(selector)?.dataset.slug === want,
      { selector: ON_STAGE, want: slug },
      { timeout: 5000 },
    );
  } catch {
    throw new Error(`the deck did not move to ${slug}`);
  }
  await page.waitForTimeout(400);
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every(
            (animation) =>
              animation.playState !== "running" ||
              animation.effect?.getTiming().iterations === Infinity,
          ),
      null,
      { timeout: 3000 },
    )
    .catch(() => undefined);
}

async function headingOf(page: Page, slug: string): Promise<ElementTarget | null> {
  const found = await page.evaluate((selector) => {
    const el = document.querySelector(`${selector} :is(h1, h2)`);
    if (!el) {
      return null;
    }
    const rect = el.getBoundingClientRect();
    return {
      name: [el.tagName.toLowerCase(), ...el.classList].join("."),
      text: (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 80),
      box: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }, ON_STAGE);
  return found ? { kind: "element", path: `slides/${slug}.html`, ...found } : null;
}

// ---------------------------------------------------------------------------------------------
// Publishing.

type Version = {
  build: Build;
  full: string;
  public: string;
  map: SlideMap;
  shots: Shots;
  message: string;
};

type RemoteDeck = { id: string; latest: number | null };

/** Creates the deck, or finds the one an earlier run made at the same slug. */
async function ensureDeck(owner: Session, slug: string, title: string): Promise<RemoteDeck> {
  const created = await owner.send("POST", paths.decks, { slug, title });
  if (created.status === 201) {
    const deck = created.body as DeckStatus;
    return { id: deck.id, latest: deck.latest };
  }
  if (created.status !== 409 || errorCode(created) !== "slug_taken") {
    throw new Error(
      `POST ${paths.decks} answered ${created.status}: ${JSON.stringify(created.body)}`,
    );
  }
  const { decks } = await owner.call<{ decks: DeckStatus[] }>("GET", paths.decks);
  const deck = decks.find((candidate) => candidate.slug === slug);
  if (!deck) {
    throw new Error(`the server says ${slug} is taken, but lists no such deck`);
  }
  return { id: deck.id, latest: deck.latest };
}

async function upload(owner: Session, deck: RemoteDeck, version: Version): Promise<PublishResult> {
  const cover = version.shots.pngs.get(version.map.slides[0]?.slug ?? "");
  if (!cover) {
    throw new Error(`${version.build.deck.name} has no first slide to make a cover of`);
  }
  const files = {
    full: textFile(version.full),
    public: textFile(version.public),
    bare: textFile(version.public),
    source: version.build.source,
    cover,
  };
  const meta = version.build.deck.deck;
  const manifest: VersionManifest = {
    protocol: PROTOCOL_VERSION,
    dekVersion: DEK_VERSION,
    deck: version.build.deck.name,
    title: meta.title,
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.event ? { event: meta.event } : {}),
    ...(meta.date ? { date: meta.date } : {}),
    lang: meta.lang,
    base: deck.latest,
    slideMap: version.map,
    lint: version.build.lint,
    renames: [],
    message: version.message,
    files: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha256(bytes)])),
    shots: Object.fromEntries([...version.shots.pngs].map(([slug, png]) => [slug, sha256(png)])),
  };

  const form = new FormData();
  form.set("manifest", JSON.stringify(manifest));
  for (const [name, bytes] of Object.entries(files)) {
    form.set(
      name,
      new File([bytes], name, {
        type: name === "cover" ? "image/png" : "application/octet-stream",
      }),
    );
  }
  for (const [slug, png] of version.shots.pngs) {
    form.set(shotField(slug), new File([png], `${slug}.png`, { type: "image/png" }));
  }
  const result = await owner.call<PublishResult>("POST", paths.versions(deck.id), form);
  deck.latest = result.n;
  return result;
}

function textFile(text: string): Bytes {
  return new TextEncoder().encode(text);
}

function sha256(bytes: Uint8Array): string {
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

/** why-dek's second version: the intro sentence tightened, in the map and in both pages. */
function tightenIntro(first: Version): Version {
  const slides = first.map.slides.map((slide) => {
    if (slide.slug !== INTRO.slug) {
      return slide;
    }
    if (!slide.script.includes(INTRO.from)) {
      throw new Error(`${INTRO.slug}'s script no longer says "${INTRO.from}"`);
    }
    return {
      ...slide,
      script: slide.script.replace(INTRO.from, INTRO.to),
      paragraphs: slide.paragraphs.map((paragraph) => paragraph.replace(INTRO.from, INTRO.to)),
    };
  });
  return {
    ...first,
    full: first.full.replaceAll(INTRO.from, INTRO.to),
    public: first.public.replaceAll(INTRO.from, INTRO.to),
    map: { ...first.map, slides },
    message: "Tighten the intro",
  };
}

// ---------------------------------------------------------------------------------------------
// Comments.

/** A passage of a slide's script, with up to 32 characters either side, as the reader marks one. */
function quote(map: SlideMap, slug: string, text: string): CommentTarget {
  const paragraph = map.slides
    .find((slide) => slide.slug === slug)
    ?.paragraphs.find((candidate) => candidate.includes(text));
  if (!paragraph) {
    throw new Error(`no paragraph of ${slug} says "${text}"`);
  }
  const at = paragraph.indexOf(text);
  return {
    kind: "quote",
    quote: text,
    prefix: paragraph.slice(Math.max(0, at - 32), at),
    suffix: paragraph.slice(at + text.length, at + text.length + 32),
  };
}

function anchor(slug: string, targets: CommentTarget[]): CommentAnchor {
  return { slug, step: "0", targets };
}

type Comment = { id: string; number: number };

async function hasComments(owner: Session, deck: RemoteDeck): Promise<boolean> {
  const { comments } = await owner.call<{ comments: Comment[] }>(
    "GET",
    `${paths.comments(deck.id)}?status=all`,
  );
  return comments.length > 0;
}

/**
 * The review the seed leaves: on why-dek, the reviewer's quote with the author's reply, the
 * author's own note resolved, and an element comment on a heading; on with-agents, one quote by
 * the reviewer, who may comment there by a grant.
 */
async function leaveComments(
  people: { demo: Session; reviewer: Session },
  whyDek: { id: string; map: SlideMap; heading: ElementTarget },
  withAgents: { id: string; map: SlideMap },
): Promise<void> {
  const { demo, reviewer } = people;
  const onTime = await comment(reviewer, whyDek.id, {
    anchor: anchor("later", [quote(whyDek.map, "later", "二十分の枠に三十分ぶん作ってしまった")]),
    text: "この例、身に覚えがありすぎます。実際の数字があるともっと刺さりそう。",
  });
  await demo.call("POST", paths.replies(whyDek.id, onTime.id), {
    text: "前回の社内 LT で 18 分枠に 26 分ぶん作った話を足します。",
  });
  const onMeasure = await comment(demo, whyDek.id, {
    anchor: anchor("order", [quote(whyDek.map, "order", "見た目は機械が測ります")]),
    text: "「測ります」だけだと何を測るのか伝わらない。はみ出しと色のコントラストと言い切る。",
  });
  await demo.call("POST", paths.resolve(whyDek.id, onMeasure.id));
  await comment(reviewer, whyDek.id, {
    anchor: anchor("later", [whyDek.heading]),
    text: "見出しが長くて一息で読めません。「三つが後回しになる」くらいまで縮めたい。",
  });
  await comment(reviewer, withAgents.id, {
    anchor: anchor("why", [quote(withAgents.map, "why", "自分が書いた画面が見えません")]),
    text: "ここで実際のはみ出しのスクリーンショットを一枚見せたい。",
  });
}

async function comment(
  session: Session,
  deckId: string,
  body: { anchor: CommentAnchor; text: string },
): Promise<Comment> {
  return session.call<Comment>("POST", paths.comments(deckId), body);
}

// ---------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const project = resolveProject(SAMPLE);
  const builds = await buildDecks(project, ["why-dek", "with-agents", "lightning"]);

  const scratch = mkdtempSync(join(tmpdir(), "dek-pub-seed-"));
  const browser = await chromium.launch();
  const firsts = new Map<string, Version>();
  try {
    for (const [name, build] of builds) {
      const shots = await shootDeck(browser, build, scratch);
      console.log(`built and shot ${name}: ${shots.pngs.size} slides`);
      firsts.set(name, {
        build,
        full: build.full,
        public: build.public,
        map: build.map,
        shots,
        message: "First publish",
      });
    }
  } finally {
    await browser.close();
    rmSync(scratch, { recursive: true, force: true });
  }
  const first = (name: string): Version => {
    const found = firsts.get(name);
    if (!found) {
      throw new Error(`no build of ${name}`);
    }
    return found;
  };

  const demo = await signIn(DEMO);
  const reviewer = await signIn(REVIEWER);

  const published = new Map<string, { deck: RemoteDeck; versions: number[]; map: SlideMap }>();
  const publish = async (name: string, versions: Version[]) => {
    const remote = await ensureDeck(demo.session, name, versions[0]?.build.deck.deck.title ?? name);
    const numbers: number[] = [];
    for (const each of versions) {
      numbers.push((await upload(demo.session, remote, each)).n);
    }
    published.set(name, {
      deck: remote,
      versions: numbers,
      map: versions.at(-1)?.map ?? first(name).map,
    });
    return remote;
  };

  const whyDek = await publish("why-dek", [first("why-dek"), tightenIntro(first("why-dek"))]);
  const withAgents = await publish("with-agents", [first("with-agents")]);
  await publish("lightning", [first("lightning")]);

  const share = (deck: RemoteDeck, request: ShareRequest) =>
    demo.session.call("PATCH", paths.deck(deck.id), request);
  await share(whyDek, { visibility: "public", scriptPublic: true, comments: "signed-in" });
  await share(withAgents, { visibility: "link", scriptPublic: false, comments: "signed-in" });
  await demo.session.call("POST", paths.grants(withAgents.id), {
    who: reviewer.handle,
    role: "comment",
  });
  await demo.session.call("POST", paths.grants(withAgents.id), {
    who: "friend@example.com",
    role: "view",
  });

  const whyMap = published.get("why-dek")?.map ?? first("why-dek").map;
  const agentsMap = published.get("with-agents")?.map ?? first("with-agents").map;
  const heading = first("why-dek").shots.headings.get("later");
  if (!heading) {
    throw new Error("why-dek's later slide has no heading to point a comment at");
  }
  if (await hasComments(demo.session, whyDek)) {
    console.log("why-dek has comments from an earlier run; adding none");
  } else {
    await leaveComments(
      { demo: demo.session, reviewer: reviewer.session },
      { id: whyDek.id, map: whyMap, heading },
      { id: withAgents.id, map: agentsMap },
    );
  }

  await requirePublicShot(whyDek, whyMap.slides[0]?.slug ?? "");
  printSummary(demo.handle, reviewer.handle, published);
}

/** The public deck's slide picture must reach someone signed out. */
async function requirePublicShot(deck: RemoteDeck, slug: string): Promise<void> {
  const response = await fetch(`${BASE}/i/${deck.id}/${deck.latest}/s-${slug}`, {
    headers: { origin: BASE },
  });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (
    response.status !== 200 ||
    response.headers.get("content-type") !== "image/png" ||
    bytes[0] !== 0x89
  ) {
    throw new Error(`someone signed out could not fetch why-dek's ${slug} picture: ${response.status}`);
  }
}

function printSummary(
  demo: string,
  reviewer: string,
  published: Map<string, { deck: RemoteDeck; versions: number[] }>,
): void {
  console.log(`
dek.pub at ${BASE} is seeded.

  author    ${DEMO.email} / ${DEMO.password}  (@${demo})
  reviewer  ${REVIEWER.email} / ${REVIEWER.password}  (@${reviewer})
`);
  for (const [name, { deck, versions }] of published) {
    console.log(`  ${BASE}/@${demo}/${name}`);
    console.log(
      `    id ${deck.id}, versions uploaded now: ${versions.join(", ")}, newest ${deck.latest}`,
    );
  }
}

await main();
