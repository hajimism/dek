import { defineHandler } from "void";
import type { DeckStatus } from "../../../../../../../src/pub/protocol.ts";
import { api } from "../../../../../src/common/http.server.ts";
import {
  deckBySlug,
  deckStatus,
  deletableDeck,
} from "../../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../../src/model/person/actor.server.ts";
import { isHandle } from "../../../../../src/model/person/handle.ts";
import { personByHandle } from "../../../../../src/model/person/store.server.ts";

/**
 * The deck at `/@handle/slug`, as its owner or an operator of dek.pub has it, so `dekc pub
 * takedown` can name a talk by its URL; a 404 for anyone else, as for a talk that is not there.
 */
export const GET = defineHandler((c) =>
  api(async (): Promise<DeckStatus> => {
    const person = await requirePerson(c);
    const handle = (c.req.param("handle") ?? "").toLowerCase();
    const owner = isHandle(handle) ? await personByHandle(c, handle) : null;
    const deck = owner ? await deckBySlug(owner.id, c.req.param("slug") ?? "") : null;
    return deckStatus(c, deletableDeck(deck, person));
  }, c.req.raw),
);
