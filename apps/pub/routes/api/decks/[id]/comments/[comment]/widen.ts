// Share a team thread with the deck's guests: it is shown to them from now on, with every reply,
// under the next shared number. A shared thread is answered as it is.

import { defineHandler } from "void";
import { api } from "../../../../../../src/common/http.server.ts";
import {
  commentFor,
  threadToChange,
  widenThread,
} from "../../../../../../src/model/comment/store.server.ts";
import { requirePerson } from "../../../../../../src/model/person/actor.server.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const { deck, side, thread } = await threadToChange(c, person, "share");
    await widenThread(thread);
    return commentFor(c, deck, person, side, thread.id);
  }, c.req.raw),
);
