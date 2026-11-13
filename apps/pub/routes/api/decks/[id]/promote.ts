import { defineHandler } from "void";
import { PromoteRequest } from "../../../../../../src/pub/protocol.ts";
import { notFound } from "../../../../src/common/api-error.ts";
import { api, jsonBody } from "../../../../src/common/http.server.ts";
import { deckStatus, ownedDeck, updateDeck } from "../../../../src/model/deck/store.server.ts";
import { findVersion } from "../../../../src/model/deck/version/store.server.ts";
import { requirePerson } from "../../../../src/model/person/actor.server.ts";

/** Point readers at another version: a rollback, or showing one uploaded with --no-promote. */
export const POST = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    const { n } = await jsonBody(c, PromoteRequest);
    if (!(await findVersion(deck.id, n))) {
      throw notFound("version");
    }
    return deckStatus(c, await updateDeck(deck, { currentVersion: n }));
  }, c.req.raw),
);
