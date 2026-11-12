import { decks } from "@schema";
import { defineHandler } from "void";
import { db, eq, sql } from "void/db";
import { ShareRequest } from "../../../../../../src/pub/protocol.ts";
import { requirePerson } from "../../../../src/server/actor.ts";
import { deckById, deckStatus, ownedDeck, writeAccess } from "../../../../src/server/decks.ts";
import { api, jsonBody } from "../../../../src/server/http.ts";

export const GET = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    return deckStatus(c, await ownedDeck(c.req.param("id") ?? "", person));
  }),
);

/** Change who may see the deck, its script, embedding, and comments. */
export const PATCH = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const deck = await ownedDeck(c.req.param("id") ?? "", person);
    const body = await jsonBody(c, ShareRequest);
    await db
      .update(decks)
      .set({ ...body, updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` })
      .where(eq(decks.id, deck.id));
    const updated = await deckById(deck.id);
    if (!updated) {
      throw new Error("the deck just updated is not there");
    }
    await writeAccess(updated);
    return deckStatus(c, updated);
  }),
);
