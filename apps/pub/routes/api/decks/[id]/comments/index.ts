import { defineHandler } from "void";
import { NewComment } from "../../../../../../../src/pub/protocol.ts";
import { ApiError, notFound } from "../../../../../src/common/api-error.ts";
import { afterAnswer, api, jsonBody } from "../../../../../src/common/http.server.ts";
import { canReadComments, mustComment } from "../../../../../src/model/comment/access.ts";
import { sendNotices } from "../../../../../src/model/comment/notice.server.ts";
import {
  commentFor,
  commentsFor,
  openThread,
  visibleThread,
} from "../../../../../src/model/comment/store.server.ts";
import { canComment } from "../../../../../src/model/deck/access.ts";
import { visibleDeck } from "../../../../../src/model/deck/store.server.ts";
import { currentPerson } from "../../../../../src/model/person/actor.server.ts";

const STATUSES = ["open", "resolved", "all"] as const;

export const GET = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck, role, side } = await visibleDeck(c.req.param("id") ?? "", person);
    if (!canReadComments(deck, person, role)) {
      throw notFound("comments");
    }
    const asked = c.req.query("status") ?? "open";
    const status = STATUSES.find((value) => value === asked);
    if (!status) {
      throw new ApiError(422, "invalid", "status is open, resolved, or all");
    }
    return { comments: await commentsFor(c, deck, person, side, status) };
  }, c.req.raw),
);

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck, role, side } = await visibleDeck(c.req.param("id") ?? "", person);
    mustComment(canComment(deck, person, role), person);
    const body = await jsonBody(c, NewComment);
    const id = await openThread(deck, person, side, body);
    const thread = await visibleThread(deck, side, id);
    afterAnswer(c, sendNotices(c, deck, thread, "thread", person, body.text));
    return Response.json(await commentFor(c, deck, person, side, id), { status: 201 });
  }, c.req.raw),
);
