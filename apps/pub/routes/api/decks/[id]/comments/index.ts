import { defineHandler } from "void";
import { NewComment } from "../../../../../../../src/pub/protocol.ts";
import { ApiError, notFound } from "../../../../../src/common/api-error.ts";
import { api, jsonBody } from "../../../../../src/common/http.server.ts";
import { canReadComments, mustComment } from "../../../../../src/model/comment/access.ts";
import { admitGuest } from "../../../../../src/model/comment/guest.server.ts";
import {
  commentFor,
  commentsFor,
  openThread,
} from "../../../../../src/model/comment/store.server.ts";
import { canComment, mayReadVersion } from "../../../../../src/model/deck/access.ts";
import { visibleDeck } from "../../../../../src/model/deck/store.server.ts";
import { currentPerson } from "../../../../../src/model/person/actor.server.ts";

const STATUSES = ["open", "resolved", "all"] as const;

export const GET = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck, grant, side } = await visibleDeck(c.req.param("id") ?? "", person);
    if (!canReadComments(deck, person, grant)) {
      throw notFound("comments");
    }
    const asked = c.req.query("status") ?? "open";
    const status = STATUSES.find((value) => value === asked);
    if (!status) {
      throw new ApiError(422, "invalid", "status is open, resolved, or all");
    }
    const askedVersion = c.req.query("version");
    const version = askedVersion ? Number(askedVersion) : null;
    if (version !== null && !mayReadVersion(deck, person, version)) {
      throw notFound("version");
    }
    return { comments: await commentsFor(c, deck, person, side, { status, version }) };
  }, c.req.raw),
);

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck, grant, side } = await visibleDeck(c.req.param("id") ?? "", person);
    mustComment(canComment(deck, person, grant), person);
    const body = await jsonBody(c, NewComment);
    await admitGuest(c, person, body, "comment");
    const id = await openThread(deck, person, side, body);
    return Response.json(await commentFor(c, deck, person, side, id), { status: 201 });
  }, c.req.raw),
);
