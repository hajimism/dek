// Likes in D1: one row for each account that likes a talk.

import { likes } from "@schema";
import { and, count, db, eq } from "void/db";
import type { LikeState } from "../../../../../../src/pub/protocol.ts";

export async function likeState(deckId: string, userId: string | null): Promise<LikeState> {
  const [total, mine] = await Promise.all([
    db.select({ n: count() }).from(likes).where(eq(likes.deckId, deckId)).get(),
    userId
      ? db
          .select({ userId: likes.userId })
          .from(likes)
          .where(and(eq(likes.deckId, deckId), eq(likes.userId, userId)))
          .get()
      : undefined,
  ]);
  return { count: total?.n ?? 0, liked: mine !== undefined };
}

export async function setLike(deckId: string, userId: string, liked: boolean): Promise<void> {
  if (liked) {
    await db.insert(likes).values({ deckId, userId }).onConflictDoNothing();
  } else {
    await db.delete(likes).where(and(eq(likes.deckId, deckId), eq(likes.userId, userId)));
  }
}
