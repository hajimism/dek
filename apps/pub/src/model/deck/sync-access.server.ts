// The access file the serve Worker reads beside each deck in R2, written from the deck's row. It
// reads the row itself, so the deck's and the versions' stores both write it after a change, and
// the deck's store closes in it, before a change to the row, whatever the change closes.

import { decks } from "@schema";
import { db, eq } from "void/db";
import { storage } from "void/storage";
import { untilWritten } from "../../common/until-written.ts";
import { accessOf, narrowing } from "./serving/access-file.ts";
import { accessKey } from "./serving/origin.ts";
import type { DeckAccess } from "./serving/type.ts";
import type { Deck, DeckPatch } from "./type.ts";

/**
 * Tell the serve Worker what it may hand out for this deck without a token. The deck is read
 * from D1 here, not taken from the caller, and the file is replaced only if it has not changed
 * since it was read, so of two requests that change the deck at once, the later state is the one
 * that stays: a slower request cannot put back what a faster one took away. A write that fails
 * after D1 changed leaves the file narrower than the row, since `narrowAccess` closed in it
 * first, until the next change to the deck, or the next version recorded, which writes it
 * whatever changed (ADR 87).
 */
export function syncAccess(deckId: string): Promise<void> {
  return writeAccess(deckId, accessOf);
}

/**
 * Before `patch` is written to the deck's row, close in the access file whatever the patch
 * closes, and open nothing yet, so a failure between this and `syncAccess` serves no more than
 * the row allows before or after. A patch that closes nothing writes nothing (ADR 87).
 */
export function narrowAccess(deckId: string, patch: DeckPatch): Promise<void> {
  return writeAccess(deckId, (deck) => narrowing(accessOf(deck), accessOf({ ...deck, ...patch })));
}

/**
 * Write the access file the deck's row gives, `access(row)`, over the file as it was read; nothing
 * when the deck is gone or `access` gives null.
 */
function writeAccess(deckId: string, access: (deck: Deck) => DeckAccess | null): Promise<void> {
  return untilWritten(async () => {
    const existing = await storage.head(accessKey(deckId));
    const deck = await db.select().from(decks).where(eq(decks.id, deckId)).get();
    const written = deck ? access(deck) : null;
    if (!written) {
      return true;
    }
    const put = await storage.put(accessKey(deckId), JSON.stringify(written), {
      httpMetadata: { contentType: "application/json" },
      onlyIf: existing ? { etagMatches: existing.etag } : { uploadedBefore: new Date(0) },
    });
    return Boolean(put);
  }, `the access file of ${deckId}`);
}

/**
 * Take the access file away, so the serve Worker hands out no build of the deck, with a token or
 * without, while the deck is deleted. A `syncAccess` that read the deck's row before it went may
 * write the file again, so `deleteDeck` takes it away once more after the rows, and its sweep of
 * the deck's files after that takes it too.
 */
export async function removeAccess(deckId: string): Promise<void> {
  await storage.delete(accessKey(deckId));
}
