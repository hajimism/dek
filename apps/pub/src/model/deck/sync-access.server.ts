// The access file the serve Worker reads beside each deck in R2, written from the deck's row. It
// reads the row itself, so the deck's and the versions' stores both write it after a change.

import { decks } from "@schema";
import { db, eq } from "void/db";
import { storage } from "void/storage";
import { accessOf } from "./serving/access-file.ts";
import { accessKey } from "./serving/origin.ts";

/**
 * Tell the serve Worker what it may hand out for this deck without a token. The deck is read
 * from D1 here, not taken from the caller, and the file is replaced only if it has not changed
 * since it was read, so of two requests that change the deck at once, the later state is the one
 * that stays: a slower request cannot put back what a faster one took away. A write that fails
 * after D1 changed leaves the file behind until the next change to the deck, or the next version
 * recorded, which writes it whatever changed.
 */
export async function syncAccess(deckId: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await storage.head(accessKey(deckId));
    const deck = await db.select().from(decks).where(eq(decks.id, deckId)).get();
    if (!deck) {
      return;
    }
    const written = await storage.put(accessKey(deckId), JSON.stringify(accessOf(deck)), {
      httpMetadata: { contentType: "application/json" },
      onlyIf: existing ? { etagMatches: existing.etag } : { uploadedBefore: new Date(0) },
    });
    if (written) {
      return;
    }
  }
  throw new Error(`the access file of ${deckId} kept changing under the write`);
}

/**
 * Take the access file away, so the serve Worker hands out no build of the deck, with a token or
 * without, before the deck itself is deleted. A `syncAccess` under way may write it again until
 * the deck's row is gone, and none writes it after; `deleteDeck` then sweeps the deck's files,
 * which takes such a file too.
 */
export async function removeAccess(deckId: string): Promise<void> {
  await storage.delete(accessKey(deckId));
}
