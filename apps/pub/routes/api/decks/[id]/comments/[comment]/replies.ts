import { defineHandler } from "void";
import { NewReply } from "../../../../../../../../src/pub/protocol.ts";
import { canComment } from "../../../../../../src/lib/access.ts";
import { currentPerson } from "../../../../../../src/server/actor.ts";
import { addReply, listComments, threadById } from "../../../../../../src/server/comments.ts";
import { visibleDeck } from "../../../../../../src/server/decks.ts";
import { ApiError, api, jsonBody, notFound } from "../../../../../../src/server/http.ts";
import { checkGuest } from "../../../../../../src/server/turnstile.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck, grant } = await visibleDeck(c.req.param("id") ?? "", person);
    if (!canComment(deck, person, grant)) {
      throw new ApiError(403, "no_comments", "comments on this deck are not open to you");
    }
    const thread = await threadById(deck, c.req.param("comment") ?? "");
    if (!thread) {
      throw notFound("comment");
    }
    const body = await jsonBody(c, NewReply);
    if (!person) {
      if (!body.guestName) {
        throw new ApiError(422, "guest_name", "a guest reply needs a name");
      }
      await checkGuest(body.turnstile, c.req.header("cf-connecting-ip"));
    }
    const replyId = await addReply(thread, person, body.text, body.guestName);
    const [row] = (await listComments(c, deck, { status: "all" })).filter(
      (comment) => comment.id === thread.id,
    );
    // The answer is the reply made, as protocol Reply; the thread it joined is a GET away.
    const reply = row?.thread.find((each) => each.id === replyId);
    if (!reply) {
      throw new Error("the reply just made is not there");
    }
    return Response.json(reply, { status: 201 });
  }, c.req.raw),
);
