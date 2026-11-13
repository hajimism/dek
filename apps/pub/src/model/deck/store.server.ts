// Decks in D1. Every change an owner makes to a deck goes through updateDeck, which writes the
// access file again whenever what it says may have changed; recording a version writes it too.

import { decks } from "@schema";
import type { Context } from "hono";
import { and, db, desc, eq } from "void/db";
import type { DeckStatus } from "../../../../../src/pub/protocol.ts";
import { ApiError, notFound } from "../../common/api-error.ts";
import { now } from "../../common/db.server.ts";
import { appUrl } from "../../common/http.server.ts";
import { newDeckId } from "../../common/ids.ts";
import { personById } from "../person/store.server.ts";
import type { Person } from "../person/type.ts";
import { canManage, canView, sideOf } from "./access.ts";
import { talkPath } from "./deck.ts";
import { claimGrants, grantedSide, grantsOf, roleOf } from "./grant/store.server.ts";
import type { GrantRole, GrantSide } from "./grant/type.ts";
import { syncAccess } from "./sync-access.server.ts";
import type { Deck, DeckPatch } from "./type.ts";
import { versionsOf } from "./version/store.server.ts";
import { summaryOf } from "./version/version.ts";

/** The columns the access file is made from; a change to any of them writes it again. */
const ACCESS_COLUMNS = ["visibility", "scriptPublic", "embed", "currentVersion"] as const;

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

/** A person's decks, newest talk first; only the public ones unless `publicOnly` is false. */
export async function decksOf(
  ownerId: string,
  options: { publicOnly: boolean; limit?: number },
): Promise<Deck[]> {
  const where = options.publicOnly
    ? and(eq(decks.ownerId, ownerId), eq(decks.visibility, "public"))
    : eq(decks.ownerId, ownerId);
  const query = db
    .select()
    .from(decks)
    .where(where)
    .orderBy(desc(decks.talkDate), desc(decks.updatedAt));
  return options.limit ? query.limit(options.limit).all() : query.all();
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

/** Make a deck, private, before its first version is uploaded. */
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
  await db.insert(decks).values({ id, ownerId: owner.id, slug, title });
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

/**
 * The deck, if `person` may see it, with the role their grants give them and the side of the work
 * they are on; a deck they may not see is as missing as one that is not. Grants waiting on an
 * address they have shown is theirs are claimed for their account here.
 */
export async function visibleDeck(
  id: string,
  person: Person | null,
): Promise<{ deck: Deck; grant: GrantRole | null; side: GrantSide }> {
  const deck = await deckById(id);
  if (!deck) {
    throw notFound();
  }
  const grants = await grantsOf(deck.id, person);
  if (person) {
    await claimGrants(grants, person);
  }
  const grant = roleOf(grants);
  if (!canView(deck, person, grant)) {
    throw notFound();
  }
  return { deck, grant, side: sideOf(deck, person, grantedSide(grants)) };
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

/** The deck's absolute URL, for the CLI, feeds and comments. */
export async function talkUrl(c: Context, deck: Deck): Promise<string> {
  return appUrl(talkPath(await ownerHandle(c, deck), deck.slug));
}

export async function deckStatus(c: Context, deck: Deck): Promise<DeckStatus> {
  const handle = await ownerHandle(c, deck);
  const versions = await versionsOf(deck.id);
  return {
    id: deck.id,
    slug: deck.slug,
    owner: handle,
    title: deck.title,
    url: appUrl(talkPath(handle, deck.slug)),
    visibility: deck.visibility,
    scriptPublic: deck.scriptPublic,
    embed: deck.embed,
    comments: deck.comments,
    current: deck.currentVersion,
    latest: deck.latestVersion,
    files: versions[0]?.files ?? {},
    versions: versions.map(summaryOf),
  };
}
