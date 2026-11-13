import { defineHandler } from "void";
import type { Me } from "../../../../src/pub/protocol.ts";
import { requirePerson } from "../../src/model/person/feature/auth/actor.server.ts";
import { api } from "../../src/common/http.server.ts";

export const GET = defineHandler((c) =>
  api(async () => {
    const person = await requirePerson(c);
    const me: Me = { id: person.id, handle: person.handle, name: person.name };
    return me;
  }, c.req.raw),
);
