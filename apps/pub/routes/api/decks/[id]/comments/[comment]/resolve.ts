import { defineHandler } from "void";
import { requirePerson } from "../../../../../../src/server/actor.ts";
import { canResolve, listComments, setResolved, threadById } from "../../../../../../src/server/comments.ts";
import { visibleDeck } from "../../../../../../src/server/decks.ts";
import { ApiError, api, notFound } from "../../../../../../src/server/http.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const { deck } = await visibleDeck(c.req.param("id") ?? "", person);
    const thread = await threadById(deck, c.req.param("comment") ?? "");
    if (!thread) {
      throw notFound("comment");
    }
    if (!canResolve(deck, thread, person)) {
      throw new ApiError(403, "not_yours", "only the deck's owner and the comment's author may resolve it");
    }
    await setResolved(thread, person, true);
    const [row] = (await listComments(c, deck, { status: "all" })).filter((comment) => comment.id === thread.id);
    if (!row) {
      throw notFound("comment");
    }
    return row;
  }, c.req.raw),
);
