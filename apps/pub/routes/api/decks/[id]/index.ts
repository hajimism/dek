import { defineHandler } from "void";
import { type DeckDeleted, ShareRequest } from "../../../../../../src/pub/protocol.ts";
import { api, jsonBody } from "../../../../src/common/http.server.ts";
import { log } from "../../../../src/common/log.ts";
import { canManage } from "../../../../src/model/deck/access.ts";
import { sharePatch } from "../../../../src/model/deck/deck.ts";
import {
  deckById,
  deckStatus,
  deletableDeck,
  deleteDeck,
  ownedDeck,
  ownerHandle,
  updateDeck,
} from "../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../src/model/person/actor.server.ts";

export const GET = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    return deckStatus(c, deck);
  }, c.req.raw),
);

/** Change who may see the deck, its script, embedding, and comments, or give it a new link. */
export const PATCH = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    const patch = sharePatch(deck, await jsonBody(c, ShareRequest));
    return deckStatus(c, await updateDeck(deck, patch));
  }, c.req.raw),
);

/**
 * Delete the talk for good: by its owner, or by an operator of dek.pub, for a takedown. An
 * operator's is logged by the IDs alone (ADR 82).
 */
export const DELETE = defineHandler((c) =>
  api(async (): Promise<DeckDeleted> => {
    const person = await requirePerson(c);
    const deck = deletableDeck(await deckById(c.req.param("id") ?? ""), person);
    const owner = await ownerHandle(c, deck);
    await deleteDeck(deck);
    if (!canManage(deck, person)) {
      log("info", "an operator took a deck down", {
        deck: deck.id,
        owner: deck.ownerId,
        operator: person.id,
      });
    }
    return { deleted: true, id: deck.id, owner, slug: deck.slug };
  }, c.req.raw),
);
