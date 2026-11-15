// Rows the medium tests start from, written to D1 as the stores would leave them.

import { decks, versions } from "@schema";
import { db, eq } from "void/db";
import { createDeck, updateDeck } from "../../src/model/deck/store.server.ts";
import { syncAccess } from "../../src/model/deck/sync-access.server.ts";
import type { Deck, DeckPatch } from "../../src/model/deck/type.ts";
import type { Person } from "../../src/model/person/type.ts";
import { slideMapOf } from "../unit/slide-map.ts";

export const owner: Person = {
  id: "u1",
  handle: "hajimism",
  name: "Hajime",
  image: null,
  email: "hajime@example.com",
  emailVerified: true,
  githubLogin: null,
};

/** Someone the deck is not shared with, signed in with a verified address. */
export const stranger: Person = {
  id: "u2",
  handle: "sato",
  name: "Sato",
  image: null,
  email: "sato@example.com",
  emailVerified: true,
  githubLogin: null,
};

let made = 0;

/** A deck of `owner`'s with version 1 current, as `patch` leaves it. */
export async function publishedDeck(patch: DeckPatch = {}): Promise<Deck> {
  made += 1;
  const created = await createDeck(owner, `talk-${made}`, "Talk");
  await db.insert(versions).values(versionRow(created.id, 1));
  await db
    .update(decks)
    .set({ currentVersion: 1, latestVersion: 1 })
    .where(eq(decks.id, created.id));
  // As recordVersion does once the version is recorded.
  await syncAccess(created.id);
  return updateDeck({ ...created, currentVersion: 1, latestVersion: 1 }, patch);
}

/** Version `n` of a deck as recorded, with one slide, `intro`, of one beat. */
export function versionRow(deckId: string, n: number) {
  return {
    deckId,
    n,
    dekVersion: "1.0.0",
    slideMap: JSON.stringify(slideMapOf([["intro", ["We start here."]]])),
    lintErrors: 0,
    lintWarnings: 0,
    bytes: 1,
    files: "{}",
    shots: "{}",
    changed: "[]",
  };
}
