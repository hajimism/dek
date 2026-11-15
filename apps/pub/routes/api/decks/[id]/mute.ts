import type { Context } from "hono";
import { defineHandler } from "void";
import type { MuteState } from "../../../../../../src/pub/protocol.ts";
import { notFound } from "../../../../src/common/api-error.ts";
import { api } from "../../../../src/common/http.server.ts";
import { canReadComments } from "../../../../src/model/comment/access.ts";
import { isMuted, setMuted } from "../../../../src/model/comment/mute.server.ts";
import { requestKey, visibleDeck } from "../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../src/model/person/actor.server.ts";

/** The deck whose mail the signed-in person sets, if they read its comments at all. */
async function readable(c: Context) {
  const person = await requirePerson(c);
  const { deck, role } = await visibleDeck(c.req.param("id") ?? "", person, requestKey(c));
  if (!canReadComments(deck, person, role)) {
    throw notFound("comments");
  }
  return { person, deck };
}

export const GET = defineHandler((c) =>
  api(async () => {
    const { person, deck } = await readable(c);
    return { muted: await isMuted(person.id, deck.id) } satisfies MuteState;
  }, c.req.raw),
);

/** Mail nothing more of the deck's comments to the signed-in person. */
export const PUT = defineHandler((c) =>
  api(async () => {
    const { person, deck } = await readable(c);
    await setMuted(person.id, deck.id, true);
    return { muted: true } satisfies MuteState;
  }, c.req.raw),
);

/** Mail them of the deck's comments again. */
export const DELETE = defineHandler((c) =>
  api(async () => {
    const { person, deck } = await readable(c);
    await setMuted(person.id, deck.id, false);
    return { muted: false } satisfies MuteState;
  }, c.req.raw),
);
