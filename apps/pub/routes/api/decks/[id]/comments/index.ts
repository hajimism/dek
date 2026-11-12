import { defineHandler } from "void";
import { NewComment } from "../../../../../../../src/pub/protocol.ts";
import { canComment, canManage } from "../../../../../src/lib/access.ts";
import { currentPerson } from "../../../../../src/server/actor.ts";
import { listComments, openThread } from "../../../../../src/server/comments.ts";
import { visibleDeck } from "../../../../../src/server/decks.ts";
import { ApiError, api, jsonBody, notFound } from "../../../../../src/server/http.ts";
import { checkGuest } from "../../../../../src/server/turnstile.ts";

const STATUSES = ["open", "resolved", "all"] as const;

export const GET = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck, grant } = await visibleDeck(c.req.param("id") ?? "", person);
    if (!canManage(deck, person) && !canComment(deck, person, grant)) {
      throw notFound("comments");
    }
    const asked = c.req.query("status") ?? "open";
    const status = STATUSES.find((value) => value === asked);
    if (!status) {
      throw new ApiError(422, "invalid", "status is open, resolved, or all");
    }
    const version = c.req.query("version");
    return { comments: await listComments(c, deck, { status, version: version ? Number(version) : null }) };
  }),
);

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await currentPerson(c);
    const { deck, grant } = await visibleDeck(c.req.param("id") ?? "", person);
    if (!canComment(deck, person, grant)) {
      throw new ApiError(403, "no_comments", "comments on this deck are not open to you", person ? undefined : "sign in to comment");
    }
    const body = await jsonBody(c, NewComment);
    if (!person) {
      if (!body.guestName) {
        throw new ApiError(422, "guest_name", "a guest comment needs a name");
      }
      await checkGuest(body.turnstile, c.req.header("cf-connecting-ip"));
    }
    const thread = await openThread(deck, person, body);
    const [row] = (await listComments(c, deck, { status: "all" })).filter((comment) => comment.id === thread.id);
    return Response.json(row, { status: 201 });
  }),
);
