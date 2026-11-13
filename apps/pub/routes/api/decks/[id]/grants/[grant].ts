import { defineHandler } from "void";
import { api } from "../../../../../src/common/http.server.ts";
import { unshare } from "../../../../../src/model/deck/grant/store.server.ts";
import { ownedDeck } from "../../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../../src/model/person/actor.server.ts";

export const DELETE = defineHandler((c) =>
  api(async () => {
    const deck = await ownedDeck(c.req.param("id") ?? "", await requirePerson(c));
    await unshare(deck.id, c.req.param("grant") ?? "");
    return { removed: true };
  }, c.req.raw),
);
