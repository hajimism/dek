import { defineHandler } from "void";
import { afterAnswer, api } from "../../../../../../src/common/http.server.ts";
import { mustResolve } from "../../../../../../src/model/comment/access.ts";
import { sendNotices } from "../../../../../../src/model/comment/notice.server.ts";
import {
  commentFor,
  setResolved,
  visibleThread,
} from "../../../../../../src/model/comment/store.server.ts";
import { requestKey, visibleDeck } from "../../../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../../../src/model/person/actor.server.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const { deck, role, side } = await visibleDeck(c.req.param("id") ?? "", person, requestKey(c));
    const thread = await visibleThread(deck, side, c.req.param("comment") ?? "");
    mustResolve(deck, thread, person, role, "resolve");
    await setResolved(thread, person, true);
    if (thread.resolvedAt === null) {
      afterAnswer(c, sendNotices(c, deck, thread, "resolve", person, ""));
    }
    return commentFor(c, deck, person, side, thread.id);
  }, c.req.raw),
);
