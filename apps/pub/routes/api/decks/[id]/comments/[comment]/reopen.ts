import { defineHandler } from "void";
import { requirePerson } from "../../../../../../src/model/person/feature/auth/actor.server.ts";
import { canResolve, listComments, setResolved, threadById } from "../../../../../../src/model/comment/store.server.ts";
import { visibleDeck } from "../../../../../../src/model/deck/store.server.ts";
import { ApiError, api, notFound } from "../../../../../../src/common/http.server.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const { deck } = await visibleDeck(c.req.param("id") ?? "", person);
    const thread = await threadById(deck, c.req.param("comment") ?? "");
    if (!thread) {
      throw notFound("comment");
    }
    if (!canResolve(deck, thread, person)) {
      throw new ApiError(403, "not_yours", "only the deck's owner and the comment's author may reopen it");
    }
    await setResolved(thread, person, false);
    const [row] = (await listComments(c, deck, { status: "all" })).filter((comment) => comment.id === thread.id);
    if (!row) {
      throw notFound("comment");
    }
    return row;
  }, c.req.raw),
);
