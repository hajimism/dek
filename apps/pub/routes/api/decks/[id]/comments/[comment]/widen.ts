// Share a team thread with the deck's guests: it is shown to them from now on, with every reply,
// under the next shared number. A shared thread is answered as it is.

import { defineHandler } from "void";
import { ApiError, notFound } from "../../../../../../src/common/api-error.ts";
import { api } from "../../../../../../src/common/http.server.ts";
import { canResolve } from "../../../../../../src/model/comment/access.ts";
import {
  commentFor,
  widenThread,
  visibleThread,
} from "../../../../../../src/model/comment/store.server.ts";
import { visibleDeck } from "../../../../../../src/model/deck/store.server.ts";
import { requirePerson } from "../../../../../../src/model/person/actor.server.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const { deck, grant, side } = await visibleDeck(c.req.param("id") ?? "", person);
    const thread = await visibleThread(deck, side, c.req.param("comment") ?? "");
    if (!canResolve(deck, thread, person, grant)) {
      throw new ApiError(
        403,
        "not_yours",
        "only the deck's owner and the comment's author may share it with the guests",
      );
    }
    await widenThread(thread);
    return commentFor(c, deck, person, side, thread.id);
  }, c.req.raw),
);
