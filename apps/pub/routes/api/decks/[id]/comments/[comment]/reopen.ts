import { defineHandler } from "void";
import { api } from "../../../../../../src/common/http.server.ts";
import {
  commentFor,
  setResolved,
  threadToChange,
} from "../../../../../../src/model/comment/store.server.ts";
import { requirePerson } from "../../../../../../src/model/person/actor.server.ts";

export const POST = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const { deck, side, thread } = await threadToChange(c, person, "reopen");
    await setResolved(thread, person, false);
    return commentFor(c, deck, person, side, thread.id);
  }, c.req.raw),
);
