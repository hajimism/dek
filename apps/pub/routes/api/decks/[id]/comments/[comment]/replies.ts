import { defineHandler } from "void";
import { NewReply } from "../../../../../../../../src/pub/protocol.ts";
import { afterAnswer, api, jsonBody } from "../../../../../../src/common/http.server.ts";
import { mustComment } from "../../../../../../src/model/comment/access.ts";
import { sendNotices } from "../../../../../../src/model/comment/notice.server.ts";
import {
  addReply,
  commentFor,
  visibleThread,
} from "../../../../../../src/model/comment/store.server.ts";
import { canComment } from "../../../../../../src/model/deck/access.ts";
import { visibleDeck } from "../../../../../../src/model/deck/store.server.ts";
import { currentPerson } from "../../../../../../src/model/person/actor.server.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck, role, side } = await visibleDeck(c.req.param("id") ?? "", person);
    mustComment(canComment(deck, person, role), person);
    const thread = await visibleThread(deck, side, c.req.param("comment") ?? "");
    const body = await jsonBody(c, NewReply);
    const replyId = await addReply(thread, person, body.text);
    afterAnswer(c, sendNotices(c, deck, thread, "reply", person, body.text));
    // The answer is the reply made, as protocol Reply; the thread it joined is a GET away.
    const reply = (await commentFor(c, deck, person, side, thread.id)).thread.find(
      (each) => each.id === replyId,
    );
    if (!reply) {
      throw new Error("the reply just made is not there");
    }
    return Response.json(reply, { status: 201 });
  }, c.req.raw),
);
