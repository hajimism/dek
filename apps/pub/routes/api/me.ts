import { defineHandler } from "void";
import { api } from "../../src/common/http.server.ts";
import { requirePerson } from "../../src/model/person/actor.server.ts";
import { meOf } from "../../src/model/person/person.ts";

export const GET = defineHandler((c) => api(async () => meOf(await requirePerson(c)), c.req.raw));
