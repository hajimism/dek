// Decks in D1. Every change an owner makes to a deck goes through updateDeck, which writes the
// access file again whenever what it says may have changed; recording a version writes it too.

import { decks } from "@schema";
import type { Context } from "hono";
import { and, count, db, desc, eq, isNotNull, sql } from "void/db";
import type { DeckStatus } from "../../../../../src/pub/protocol.ts";
import { ApiError, notFound } from "../../common/api-error.ts";
import { now } from "../../common/db.server.ts";
import { appUrl } from "../../common/http.server.ts";
import { newDeckId } from "../../common/ids.ts";
import { personById } from "../person/store.server.ts";
import type { Account, Person } from "../person/type.ts";
import { canManage, standingOn } from "./access.ts";
import { talkHref, talkPath } from "./deck.ts";
import { grantsOf } from "./grant/store.server.ts";
import { syncAccess } from "./sync-access.server.ts";
import type { Deck, DeckPatch, Standing } from "./type.ts";
import { currentVersionOf } from "./version/store.server.ts";
import type { Version } from "./version/type.ts";

/** The columns of the access file an owner may change; a change to any of them writes it again. */
const ACCESS_COLUMNS = ["visibility", "scriptPublic", "embed"] as const;

export async function deckById(id: string): Promise<Deck | null> {
  return (await db.select().from(decks).where(eq(decks.id, id)).get()) ?? null;
}

export async function deckBySlug(ownerId: string, slug: string): Promise<Deck | null> {
  return (
    (await db
      .select()
      .from(decks)
      .where(and(eq(decks.ownerId, ownerId), eq(decks.slug, slug)))
      .get()) ?? null
  );
}

/**
 * Which of a person's decks a profile counts: those readers can open, and only the public ones
 * unless `publicOnly` is false.
 */
function profileDecks(ownerId: string, publicOnly: boolean) {
  return and(
    eq(decks.ownerId, ownerId),
    isNotNull(decks.currentVersion),
    publicOnly ? eq(decks.visibility, "public") : undefined,
  );
}

/** The day a talk counts as given: its date, else the day it last changed, as the timeline says. */
const talkDay = sql`coalesce(${decks.talkDate}, substr(${decks.updatedAt}, 1, 10))`;

/** A person's decks that readers can open, newest talk first, `limit` of them from `offset`. */
export async function decksOf(
  ownerId: string,
  options: { publicOnly: boolean; limit?: number; offset?: number },
): Promise<Deck[]> {
  const query = db
    .select()
    .from(decks)
    .where(profileDecks(ownerId, options.publicOnly))
    .orderBy(desc(talkDay), desc(decks.updatedAt), desc(decks.id));
  return options.limit
    ? query
        .limit(options.limit)
        .offset(options.offset ?? 0)
        .all()
    : query.all();
}

/** How many decks decksOf has for a person, all pages together. */
export async function deckCount(
  ownerId: string,
  options: { publicOnly: boolean },
): Promise<number> {
  const row = await db
    .select({ n: count() })
    .from(decks)
    .where(profileDecks(ownerId, options.publicOnly))
    .get();
  return row?.n ?? 0;
}

/** The decks a person owns, the one changed last first, for the CLI. */
export async function ownDecks(ownerId: string): Promise<Deck[]> {
  return db
    .select()
    .from(decks)
    .where(eq(decks.ownerId, ownerId))
    .orderBy(desc(decks.updatedAt))
    .all();
}

export async function recentPublicDecks(limit: number): Promise<Deck[]> {
  return db
    .select()
    .from(decks)
    .where(eq(decks.visibility, "public"))
    .orderBy(desc(decks.updatedAt))
    .limit(limit)
    .all();
}

/** The public decks readers can open, the one changed last first, as much as the sitemap needs. */
export async function indexedDecks(
  limit: number,
): Promise<Pick<Deck, "ownerId" | "slug" | "updatedAt">[]> {
  return db
    .select({ ownerId: decks.ownerId, slug: decks.slug, updatedAt: decks.updatedAt })
    .from(decks)
    .where(and(eq(decks.visibility, "public"), isNotNull(decks.currentVersion)))
    .orderBy(desc(decks.updatedAt))
    .limit(limit)
    .all();
}

/** Make a deck, kept to its team, before its first version is uploaded. */
export async function createDeck(owner: Person, slug: string, title: string): Promise<Deck> {
  if (await deckBySlug(owner.id, slug)) {
    throw new ApiError(
      409,
      "slug_taken",
      `you already have a deck at ${talkPath(owner.handle, slug)}`,
      "put that deck's ID in pub: in script.md, or rename the deck folder",
    );
  }
  const id = newDeckId();
  await db.insert(decks).values({ id, ownerId: owner.id, slug, title, visibility: "team" });
  await syncAccess(id);
  return mustFind(id);
}

export async function updateDeck(deck: Deck, patch: DeckPatch): Promise<Deck> {
  await db
    .update(decks)
    .set({ ...patch, updatedAt: now })
    .where(eq(decks.id, deck.id));
  if (ACCESS_COLUMNS.some((column) => column in patch)) {
    await syncAccess(deck.id);
  }
  return mustFind(deck.id);
}

async function mustFind(id: string): Promise<Deck> {
  const deck = await deckById(id);
  if (!deck) {
    throw new Error(`the deck ${id} just written is not there`);
  }
  return deck;
}

/** The link key a request carries as `?key=`, which opens a `link` deck to whoever holds it. */
export function requestKey(c: Context): string | null {
  return c.req.query("key") ?? null;
}

/**
 * Where `person`, holding `key`, stands with the deck, or null when it does not open to them. A
 * grant by an address they have verified counts whether or not it is claimed yet, so reading
 * writes nothing.
 */
export async function standingWith(
  deck: Deck,
  person: Account | null,
  key: string | null,
): Promise<Standing | null> {
  const grants = await grantsOf(deck.id, person);
  const standing = standingOn(deck, person, grants, key);
  return standing.opens ? standing : null;
}

/**
 * The deck, if `person`, holding `key`, may see it, with where they stand; a deck they may not see
 * is as missing as one that is not. The deck's ID opens nothing by itself: a script.md committed
 * with its `pub:` gives it away.
 */
export async function visibleDeck(
  id: string,
  person: Account | null,
  key: string | null,
): Promise<Standing & { deck: Deck }> {
  const deck = await deckById(id);
  const standing = deck && (await standingWith(deck, person, key));
  if (!deck || !standing) {
    throw notFound();
  }
  return { deck, ...standing };
}

export async function ownedDeck(id: string, person: Person): Promise<Deck> {
  const deck = await deckById(id);
  if (!deck || !canManage(deck, person)) {
    throw notFound();
  }
  return deck;
}

async function ownerHandle(c: Context, deck: Deck): Promise<string> {
  return (await personById(c, deck.ownerId))?.handle ?? deck.ownerId;
}

/**
 * The deck's absolute URL with no key, for those it is shared with, who open it by their grant or
 * as its owner: review threads' links and the mail about them, and invitations. A key in these
 * would open nothing more to them, and would go wherever they are pasted.
 */
export async function talkUrl(c: Context, deck: Deck): Promise<string> {
  return appUrl(talkPath(await ownerHandle(c, deck), deck.slug));
}

/**
 * The deck's absolute URL to hand out, with the key a `link` deck opens by, as `DeckStatus.url`
 * gives it too: for `PublishResult.url`.
 */
export async function shareUrl(c: Context, deck: Deck): Promise<string> {
  return appUrl(talkHref(await ownerHandle(c, deck), deck));
}

/** The deck as the CLI is told of it; `version` is its current one, when the caller has it. */
export async function deckStatus(
  c: Context,
  deck: Deck,
  version?: Version | null,
): Promise<DeckStatus> {
  const handle = await ownerHandle(c, deck);
  const current = version === undefined ? await currentVersionOf(deck) : version;
  return {
    id: deck.id,
    slug: deck.slug,
    owner: handle,
    title: deck.title,
    url: appUrl(talkHref(handle, deck)),
    visibility: deck.visibility,
    scriptPublic: deck.scriptPublic,
    embed: deck.embed,
    comments: deck.comments,
    current: deck.currentVersion,
    files: current?.files ?? {},
  };
}
