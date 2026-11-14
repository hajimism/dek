import { defineHandler } from "void";
import { ShareRequest } from "../../../../../../src/pub/protocol.ts";
import { api, jsonBody } from "../../../../src/common/http.server.ts";
import { sharePatch } from "../../../../src/model/deck/deck.ts";
import { deckStatus, ownedDeck, updateDeck } from "../../../../src/model/deck/store.server.ts";
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
