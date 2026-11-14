import { defineHandler } from "void";
import { NewPublicComment } from "../../../../../../../src/pub/protocol.ts";
import { notFound } from "../../../../../src/common/api-error.ts";
import { api, jsonBody } from "../../../../../src/common/http.server.ts";
import { opensToAnyone } from "../../../../../src/model/deck/access.ts";
import { mustPostPublic } from "../../../../../src/model/deck/public-comment/access.ts";
import {
  postPublic,
  publicCommentFor,
  publicCommentsOf,
} from "../../../../../src/model/deck/public-comment/store.server.ts";
import { visibleDeck } from "../../../../../src/model/deck/store.server.ts";
import { currentPerson } from "../../../../../src/model/person/actor.server.ts";

/** The talk's public comments; only a talk anyone may open has them. */
export const GET = defineHandler((c) =>
  api(async () => {
    const { deck } = await visibleDeck(c.req.param("id") ?? "", await currentPerson(c));
    if (!opensToAnyone(deck)) {
      throw notFound("comments");
    }
    return { comments: await publicCommentsOf(c, deck.id) };
  }, c.req.raw),
);

/** Post a public comment, or a reply to one, as the deck's comment policy lets. */
export const POST = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck } = await visibleDeck(c.req.param("id") ?? "", person);
    if (!opensToAnyone(deck)) {
      throw notFound("comments");
    }
    mustPostPublic(deck, person);
    const body = await jsonBody(c, NewPublicComment);
    const id = await postPublic(deck.id, person, body);
    return Response.json(await publicCommentFor(c, deck.id, id), { status: 201 });
  }, c.req.raw),
);
