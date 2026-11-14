import { defineHandler } from "void";
import type { DeckFound } from "../../../../../../../src/pub/protocol.ts";
import { api } from "../../../../../src/common/http.server.ts";
import {
  deckBySlug,
  deletableDeck,
  ownerHandle,
} from "../../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../../src/model/person/actor.server.ts";
import { isHandle } from "../../../../../src/model/person/handle.ts";
import { personByHandle } from "../../../../../src/model/person/store.server.ts";

/**
 * The deck at `/@handle/slug`, named by its ID, to its owner or an operator of dek.pub, so `dekc
 * pub takedown` can name a talk by its URL; a 404 for anyone else, as for a talk that is not
 * there. It answers nothing that opens the deck: an operator is not handed a `link` talk's key.
 */
export const GET = defineHandler((c) =>
  api(async (): Promise<DeckFound> => {
    const person = await requirePerson(c);
    const handle = (c.req.param("handle") ?? "").toLowerCase();
    const owner = isHandle(handle) ? await personByHandle(c, handle) : null;
    const deck = deletableDeck(
      owner ? await deckBySlug(owner.id, c.req.param("slug") ?? "") : null,
      person,
    );
    return { id: deck.id, owner: await ownerHandle(c, deck), slug: deck.slug };
  }, c.req.raw),
);
