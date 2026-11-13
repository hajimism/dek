import { defineHandler } from "void";
import { NewReply } from "../../../../../../../../src/pub/protocol.ts";
import { notFound } from "../../../../../../src/common/api-error.ts";
import { api, jsonBody } from "../../../../../../src/common/http.server.ts";
import { mustComment } from "../../../../../../src/model/comment/access.ts";
import { admitGuest } from "../../../../../../src/model/comment/guest.server.ts";
import {
  addReply,
  commentFor,
  threadById,
} from "../../../../../../src/model/comment/store.server.ts";
import { canComment } from "../../../../../../src/model/deck/access.ts";
import { visibleDeck } from "../../../../../../src/model/deck/store.server.ts";
import { currentPerson } from "../../../../../../src/model/person/actor.server.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck, grant } = await visibleDeck(c.req.param("id") ?? "", person);
    mustComment(canComment(deck, person, grant), person);
    const thread = await threadById(deck, c.req.param("comment") ?? "");
    if (!thread) {
      throw notFound("comment");
    }
    const body = await jsonBody(c, NewReply);
    await admitGuest(c, person, body, "reply");
    const replyId = await addReply(thread, person, body.text, body.guestName);
    // The answer is the reply made, as protocol Reply; the thread it joined is a GET away.
    const reply = (await commentFor(c, deck, person, thread.id)).thread.find(
      (each) => each.id === replyId,
    );
    if (!reply) {
      throw new Error("the reply just made is not there");
    }
    return Response.json(reply, { status: 201 });
  }, c.req.raw),
);
