import { defineHandler } from "void";
import { NewComment } from "../../../../../../../src/pub/protocol.ts";
import { canComment, canManage } from "../../../../../src/model/deck/access.ts";
import { hideQuotes } from "../../../../../src/model/comment/view.ts";
import { currentPerson } from "../../../../../src/model/person/feature/auth/actor.server.ts";
import { listComments, openThread } from "../../../../../src/model/comment/store.server.ts";
import { visibleDeck } from "../../../../../src/model/deck/store.server.ts";
import { ApiError, api, jsonBody, notFound } from "../../../../../src/common/http.server.ts";
import { checkGuest } from "../../../../../src/model/comment/turnstile.server.ts";

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
    const comments = await listComments(c, deck, {
      status,
      version: version ? Number(version) : null,
    });
    // A quoted passage is part of the script: someone the script is hidden from gets the comment
    // without it, as the talk page shows it.
    const seesScript = deck.scriptPublic || canManage(deck, person);
    return { comments: seesScript ? comments : comments.map(hideQuotes) };
  }, c.req.raw),
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
  }, c.req.raw),
);
