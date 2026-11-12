// What the pages load: a talk with its article and comments, a profile's talks, the newest public
// talks. Access is decided as the API decides it (visibleDeck, canComment), and a talk someone may
// not see loads as a missing one, so its page cannot tell the two apart.

import { decks, grants } from "@schema";
import type { Context } from "hono";
import { and, asc, db, desc, eq } from "void/db";
import { env } from "void/env";
import type {
  CommentPolicy,
  CommentRow,
  SlideMap,
  Visibility,
} from "../../../../src/pub/protocol.ts";
import { canComment, canManage } from "../lib/access.ts";
import { deckOrigin } from "../lib/deck-origin.ts";
import { guessLang } from "../lib/i18n.ts";
import { signServeToken } from "../lib/serve-token.ts";
import { currentPerson } from "./actor.ts";
import { listComments } from "./comments.ts";
import { type DeckRow, deckBySlug, talkUrl, versionRow, visibleDeck } from "./decks.ts";
import { ApiError } from "./http.ts";
import { type Account, userByHandle, usersById } from "./users.ts";

const TOKEN_SECONDS = 10 * 60;

export type Owner = { handle: string; name: string; image: string | null };

export type TalkCard = {
  slug: string;
  title: string;
  event: string | null;
  date: string | null;
  slides: number;
  visibility: Visibility;
  picture: string | null;
  owner: Owner;
  updatedAt: string;
};

export type ArticleSlide = {
  slug: string;
  title: string;
  steps: string[];
  /** Null when the reader may not see the script. */
  paragraphs: string[] | null;
  picture: string | null;
};

export type Talk = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  event: string | null;
  date: string | null;
  lang: string | null;
  visibility: Visibility;
  scriptPublic: boolean;
  commentPolicy: CommentPolicy;
  url: string;
  owner: Owner;
  version: number;
  viewer: { src: string; origin: string };
  slides: ArticleSlide[];
  script: "public" | "owner" | "hidden";
  isOwner: boolean;
  /** What the comments API would answer this person; null when it would not. */
  comments: CommentRow[] | null;
  canComment: boolean;
  /** The picture link previews show, as an absolute URL. */
  image: string | null;
  more: TalkCard[];
};

function owner(account: Account): Owner {
  return { handle: account.handle, name: account.name, image: account.image };
}

/** `@handle` as the URL carries it, else null: a profile URL always starts with `@`. */
export function handleOf(segment: string | undefined): string | null {
  const value = decodeURIComponent(segment ?? "");
  return value.startsWith("@") && value.length > 1 ? value.slice(1).toLowerCase() : null;
}

function pictureOf(
  deck: { id: string },
  n: number,
  files: Record<string, string>,
  shots: Record<string, string>,
  slugs: readonly string[],
): string | null {
  if (files.cover) {
    return `/i/${deck.id}/${n}/cover`;
  }
  const first = slugs.find((slug) => shots[slug]);
  return first ? `/i/${deck.id}/${n}/s-${first}` : null;
}

export async function loadTalk(
  c: Context,
  segment: string | undefined,
  slug: string | undefined,
): Promise<Talk | null> {
  const handle = handleOf(segment);
  if (!handle || !slug) {
    return null;
  }
  const account = await userByHandle(c, handle);
  if (!account) {
    return null;
  }
  const row = await deckBySlug(account.id, slug);
  if (!row || row.latestVersion === null) {
    return null;
  }
  const person = await currentPerson(c).catch(() => null);
  let grant: Awaited<ReturnType<typeof visibleDeck>>["grant"];
  let deck: DeckRow;
  try {
    ({ deck, grant } = await visibleDeck(row.id, person));
  } catch (error) {
    if (error instanceof ApiError) {
      return null;
    }
    throw error;
  }
  // Readers see the current version; the owner of a deck whose versions were all uploaded with
  // --no-promote sees the newest, so the page is never a 404 to the one who published it.
  const n = deck.currentVersion ?? (canManage(deck, person) ? deck.latestVersion : null);
  if (n === null) {
    return null;
  }
  const version = await versionRow(deck.id, n);
  if (!version) {
    return null;
  }
  const map = JSON.parse(version.slideMap) as SlideMap;
  const shots = JSON.parse(version.shots) as Record<string, string>;
  const files = JSON.parse(version.files) as Record<string, string>;
  const isOwner = canManage(deck, person);
  const script = deck.scriptPublic ? "public" : isOwner ? "owner" : "hidden";

  const origin = deckOrigin(env.DECK_ORIGIN, deck.id);
  let src = `${origin}/v/${n}/`;
  if (deck.visibility !== "public" || n !== deck.currentVersion) {
    const token = await signServeToken(env.SERVE_TOKEN_SECRET, {
      deck: deck.id,
      n,
      variant: deck.scriptPublic ? "public" : "bare",
      exp: Math.floor(Date.now() / 1000) + TOKEN_SECONDS,
    });
    src += `?t=${encodeURIComponent(token)}`;
  }

  const mayComment = canComment(deck, person, grant);
  const comments =
    isOwner || mayComment ? await listComments(c, deck, { status: "all", version: n }) : null;
  const picture = pictureOf(
    deck,
    n,
    files,
    shots,
    map.slides.map((slide) => slide.slug),
  );

  return {
    id: deck.id,
    slug: deck.slug,
    title: deck.title,
    description: deck.description,
    event: deck.event,
    date: deck.talkDate,
    lang:
      deck.lang ??
      guessLang([deck.title, ...map.slides.flatMap((slide) => [slide.title, ...slide.paragraphs])]),
    visibility: deck.visibility,
    scriptPublic: deck.scriptPublic,
    commentPolicy: deck.comments,
    url: talkUrl(account.handle, deck.slug),
    owner: owner(account),
    version: n,
    viewer: { src, origin },
    slides: map.slides.map((slide) => ({
      slug: slide.slug,
      title: slide.title,
      steps: slide.steps.map((step) => step.step),
      paragraphs: script === "hidden" ? null : slide.paragraphs,
      picture: shots[slide.slug] ? `/i/${deck.id}/${n}/s-${slide.slug}` : null,
    })),
    script,
    isOwner,
    comments,
    canComment: mayComment,
    image: picture ? `${env.APP_ORIGIN}${picture}` : null,
    more: (await talkCards(c, account, { publicOnly: true, limit: 4 }))
      .filter((card) => card.slug !== deck.slug)
      .slice(0, 3),
  };
}

/** A deck the person owns, for its dashboard; anyone else gets null, as for a missing one. */
export async function loadOwnedDeck(
  c: Context,
  segment: string | undefined,
  slug: string | undefined,
): Promise<{ deck: DeckRow; owner: Owner } | null> {
  const handle = handleOf(segment);
  if (!handle || !slug) {
    return null;
  }
  const account = await userByHandle(c, handle);
  const person = await currentPerson(c).catch(() => null);
  if (!account || !person || person.id !== account.id) {
    return null;
  }
  const deck = await deckBySlug(account.id, slug);
  return deck ? { deck, owner: owner(account) } : null;
}

async function cards(
  c: Context,
  rows: DeckRow[],
  owners?: Map<string, Account>,
): Promise<TalkCard[]> {
  const people =
    owners ??
    (await usersById(
      c,
      rows.map((row) => row.ownerId),
    ));
  const result: TalkCard[] = [];
  for (const row of rows) {
    const account = people.get(row.ownerId);
    if (!account || row.currentVersion === null) {
      continue;
    }
    const version = await versionRow(row.id, row.currentVersion);
    if (!version) {
      continue;
    }
    const map = JSON.parse(version.slideMap) as SlideMap;
    result.push({
      slug: row.slug,
      title: row.title,
      event: row.event,
      date: row.talkDate,
      slides: map.slides.length,
      visibility: row.visibility,
      picture: pictureOf(
        row,
        row.currentVersion,
        JSON.parse(version.files) as Record<string, string>,
        JSON.parse(version.shots) as Record<string, string>,
        map.slides.map((slide) => slide.slug),
      ),
      owner: owner(account),
      updatedAt: row.updatedAt,
    });
  }
  return result;
}

export async function talkCards(
  c: Context,
  account: Account,
  options: { publicOnly: boolean; limit?: number },
): Promise<TalkCard[]> {
  const where = options.publicOnly
    ? and(eq(decks.ownerId, account.id), eq(decks.visibility, "public"))
    : eq(decks.ownerId, account.id);
  const query = db
    .select()
    .from(decks)
    .where(where)
    .orderBy(desc(decks.talkDate), desc(decks.updatedAt));
  const rows = options.limit ? await query.limit(options.limit).all() : await query.all();
  return cards(c, rows, new Map([[account.id, account]]));
}

export async function recentPublicTalks(c: Context, limit: number): Promise<TalkCard[]> {
  const rows = await db
    .select()
    .from(decks)
    .where(eq(decks.visibility, "public"))
    .orderBy(desc(decks.updatedAt))
    .limit(limit)
    .all();
  return cards(c, rows);
}

export type GrantView = { id: string; who: string; role: "view" | "comment"; createdAt: string };

/** The people a deck is shared with, as GET /api/decks/:id/grants lists them. */
export async function grantList(c: Context, deckId: string): Promise<GrantView[]> {
  const rows = await db
    .select()
    .from(grants)
    .where(eq(grants.deckId, deckId))
    .orderBy(asc(grants.createdAt))
    .all();
  const people = await usersById(
    c,
    rows.flatMap((row) => (row.userId ? [row.userId] : [])),
  );
  return rows.map((row) => ({
    id: row.id,
    who: row.userId ? (people.get(row.userId)?.handle ?? row.userId) : (row.email ?? ""),
    role: row.role,
    createdAt: row.createdAt,
  }));
}
