import type { Context } from "hono";
import { defineHandler } from "void";
import type { LikeState } from "../../../../../../src/pub/protocol.ts";
import { notFound } from "../../../../src/common/api-error.ts";
import { api } from "../../../../src/common/http.server.ts";
import { canLike } from "../../../../src/model/deck/like/like.ts";
import { likeState, setLike } from "../../../../src/model/deck/like/store.server.ts";
import { requestKey, visibleDeck } from "../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../src/model/person/actor.server.ts";

async function like(c: Context, liked: boolean): Promise<LikeState> {
  const person = await requirePerson(c);
  const { deck } = await visibleDeck(c.req.param("id") ?? "", person, requestKey(c));
  if (!canLike(deck, person)) {
    throw notFound("like");
  }
  await setLike(deck.id, person.id, liked);
  return likeState(deck.id, person.id);
}

/** Like the talk; liking it again changes nothing. */
export const PUT = defineHandler((c) => api(() => like(c, true), c.req.raw));

/** Take the like back. */
export const DELETE = defineHandler((c) => api(() => like(c, false), c.req.raw));
