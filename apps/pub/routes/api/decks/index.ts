import { defineHandler } from "void";
import { CreateDeckRequest } from "../../../../../src/pub/protocol.ts";
import { api, jsonBody } from "../../../src/common/http.server.ts";
import { createDeck, deckStatus, ownDecks } from "../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../src/model/person/actor.server.ts";

/** Create a deck, kept to its team, before its first version is uploaded. */
export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const { slug, title } = await jsonBody(c, CreateDeckRequest);
    const deck = await createDeck(person, slug, title);
    return Response.json(await deckStatus(c, deck), { status: 201 });
  }, c.req.raw),
);

/** The caller's own decks, newest first. */
export const GET = defineHandler((c) =>
  api(async () => {
    const decks = await ownDecks((await requirePerson(c)).id);
    return { decks: await Promise.all(decks.map((deck) => deckStatus(c, deck))) };
  }, c.req.raw),
);
