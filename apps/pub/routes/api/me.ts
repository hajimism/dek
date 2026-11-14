import { defineHandler } from "void";
import { UpdateMe } from "../../../../src/pub/protocol.ts";
import { api, jsonBody } from "../../src/common/http.server.ts";
import { requirePerson } from "../../src/model/person/actor.server.ts";
import { saveName } from "../../src/model/person/feature/settings/settings.server.ts";
import { meOf } from "../../src/model/person/person.ts";

export const GET = defineHandler((c) => api(async () => meOf(await requirePerson(c)), c.req.raw));

export const PATCH = defineHandler((c) =>
  api(async () => saveName(c, (await jsonBody(c, UpdateMe)).name), c.req.raw),
);
