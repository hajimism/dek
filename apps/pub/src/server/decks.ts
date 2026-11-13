// Decks and versions in D1, and the access file the serve Worker reads in R2.

import { decks, grants, versions } from "@schema";
import type { Context } from "hono";
import { and, db, desc, eq, or } from "void/db";
import { env } from "void/env";
import { storage } from "void/storage";
import type { DeckStatus, LintSummary, VersionSummary } from "../../../../src/pub/protocol.ts";
import { canManage, canView, type GrantRole, type Person } from "../lib/access.ts";
import { accessKey, type DeckAccess } from "../lib/deck-origin.ts";
import { notFound } from "./http.ts";
import type { Account } from "./users.ts";
import { userById } from "./users.ts";

export type DeckRow = typeof decks.$inferSelect;
export type VersionRow = typeof versions.$inferSelect;

export async function deckById(id: string): Promise<DeckRow | null> {
  return (await db.select().from(decks).where(eq(decks.id, id)).get()) ?? null;
}

export async function deckBySlug(ownerId: string, slug: string): Promise<DeckRow | null> {
  return (
    (await db
      .select()
      .from(decks)
      .where(and(eq(decks.ownerId, ownerId), eq(decks.slug, slug)))
      .get()) ?? null
  );
}

/**
 * The role a person was granted on a deck: by account, or by an email address only once the
 * account has shown it owns that address. A grant by address is tied to the account the first
 * time it matches. Of two grants, the one that allows more counts.
 */
async function grantRole(deck: DeckRow, person: Person | null): Promise<GrantRole | null> {
  if (!person) {
    return null;
  }
  const email = person.emailVerified ? person.email?.toLowerCase() : undefined;
  const match = email
    ? or(eq(grants.userId, person.id), eq(grants.email, email))
    : eq(grants.userId, person.id);
  const rows = await db
    .select({ id: grants.id, role: grants.role, userId: grants.userId })
    .from(grants)
    .where(and(eq(grants.deckId, deck.id), match))
    .all();
  for (const row of rows) {
    if (row.userId === null) {
      await db.update(grants).set({ userId: person.id }).where(eq(grants.id, row.id));
    }
  }
  if (rows.some((row) => row.role === "comment")) {
    return "comment";
  }
  return rows.length > 0 ? "view" : null;
}

/** The deck, if `person` may see it; a deck they may not see is as missing as one that is not. */
export async function visibleDeck(
  id: string,
  person: Account | Person | null,
): Promise<{ deck: DeckRow; grant: GrantRole | null }> {
  const deck = await deckById(id);
  if (!deck) {
    throw notFound();
  }
  const grant = await grantRole(deck, person);
  if (!canView(deck, person, grant)) {
    throw notFound();
  }
  return { deck, grant };
}

export async function ownedDeck(id: string, person: Person): Promise<DeckRow> {
  const deck = await deckById(id);
  if (!deck || !canManage(deck, person)) {
    throw notFound();
  }
  return deck;
}

export async function versionRows(deckId: string): Promise<VersionRow[]> {
  return db
    .select()
    .from(versions)
    .where(eq(versions.deckId, deckId))
    .orderBy(desc(versions.n))
    .all();
}

export async function versionRow(deckId: string, n: number): Promise<VersionRow | null> {
  return (
    (await db
      .select()
      .from(versions)
      .where(and(eq(versions.deckId, deckId), eq(versions.n, n)))
      .get()) ?? null
  );
}
export function versionSummary(row: VersionRow): VersionSummary {
  const lint: LintSummary = { errors: row.lintErrors, warnings: row.lintWarnings };
  return {
    n: row.n,
    dekVersion: row.dekVersion,
    message: row.message,
    bytes: row.bytes,
    lint,
    createdAt: row.createdAt,
    changed: JSON.parse(row.changed) as string[],
  };
}

export function talkUrl(handle: string, slug: string): string {
  return `${env.APP_ORIGIN}/@${handle}/${slug}`;
}

export async function deckStatus(c: Context, deck: DeckRow): Promise<DeckStatus> {
  const owner = await userById(c, deck.ownerId);
  const handle = owner?.handle ?? deck.ownerId;
  const rows = await versionRows(deck.id);
  const latest = rows[0];
  return {
    id: deck.id,
    slug: deck.slug,
    owner: handle,
    title: deck.title,
    url: talkUrl(handle, deck.slug),
    visibility: deck.visibility,
    scriptPublic: deck.scriptPublic,
    embed: deck.embed,
    comments: deck.comments,
    current: deck.currentVersion,
    latest: deck.latestVersion,
    files: latest ? (JSON.parse(latest.files) as DeckStatus["files"]) : {},
    versions: rows.map(versionSummary),
  };
}

/**
 * Tell the serve Worker what it may hand out for this deck without a token. The deck is read
 * from D1 here, not taken from the caller, and the file is replaced only if it has not changed
 * since it was read, so of two requests that change the deck at once, the later state is the one
 * that stays: a slower request cannot put back what a faster one took away.
 */
export async function writeAccess(deckId: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await storage.head(accessKey(deckId));
    const deck = await deckById(deckId);
    if (!deck) {
      return;
    }
    const access: DeckAccess = {
      visibility: deck.visibility,
      scriptPublic: deck.scriptPublic,
      embed: deck.embed,
      current: deck.currentVersion,
    };
    const written = await storage.put(accessKey(deckId), JSON.stringify(access), {
      httpMetadata: { contentType: "application/json" },
      onlyIf: existing ? { etagMatches: existing.etag } : { uploadedBefore: new Date(0) },
    });
    if (written) {
      return;
    }
  }
  throw new Error(`the access file of ${deckId} kept changing under the write`);
}
