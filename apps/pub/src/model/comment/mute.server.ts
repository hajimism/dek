// The decks whose comments a person has asked to hear nothing of by mail.

import { mutes } from "@schema";
import { and, db, eq, inArray } from "void/db";

export async function isMuted(userId: string, deckId: string): Promise<boolean> {
  return (await mutedAmong(deckId, [userId])).has(userId);
}

/** Of `userIds`, those who muted the deck. */
export async function mutedAmong(deckId: string, userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ userId: mutes.userId })
    .from(mutes)
    .where(and(eq(mutes.deckId, deckId), inArray(mutes.userId, [...userIds])))
    .all();
  return new Set(rows.map((row) => row.userId));
}

export async function setMuted(userId: string, deckId: string, muted: boolean): Promise<void> {
  if (muted) {
    await db.insert(mutes).values({ userId, deckId }).onConflictDoNothing();
  } else {
    await db.delete(mutes).where(and(eq(mutes.userId, userId), eq(mutes.deckId, deckId)));
  }
}
