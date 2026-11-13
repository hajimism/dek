import { defineHandler } from "void";
import { EditPublicComment } from "../../../../../../../src/pub/protocol.ts";
import { ApiError, notFound } from "../../../../../src/common/api-error.ts";
import { api, jsonBody } from "../../../../../src/common/http.server.ts";
import {
  mayDeletePublic,
  mayEditPublic,
  publicCommentsOn,
} from "../../../../../src/model/comment/public/access.ts";
import {
  deletePublic,
  editPublic,
  findPublic,
  publicCommentFor,
} from "../../../../../src/model/comment/public/store.server.ts";
import { visibleDeck } from "../../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../../src/model/person/actor.server.ts";
import type { Context } from "hono";

async function target(c: Context) {
  const person = await requirePerson(c);
  const { deck } = await visibleDeck(c.req.param("id") ?? "", person);
  if (!publicCommentsOn(deck)) {
    throw notFound("comment");
  }
  return { person, deck, row: await findPublic(deck.id, c.req.param("comment") ?? "") };
}

/** Change the words of one's own comment. */
export const PATCH = defineHandler((c) =>
  api(async () => {
    const { person, deck, row } = await target(c);
    if (!mayEditPublic(row, person)) {
      throw new ApiError(403, "not_yours", "only its author may change a comment");
    }
    await editPublic(row, (await jsonBody(c, EditPublicComment)).text);
    return publicCommentFor(c, deck.id, row.id);
  }, c.req.raw),
);

/** Remove a comment and its replies: its author, or the deck's owner. */
export const DELETE = defineHandler((c) =>
  api(async () => {
    const { person, deck, row } = await target(c);
    if (!mayDeletePublic(deck, row, person)) {
      throw new ApiError(403, "not_yours", "only its author and the deck's owner may remove a comment");
    }
    await deletePublic(row);
    return { removed: true };
  }, c.req.raw),
);
