import { defineHandler } from "void";
import { ProfileLinks } from "../../../../../src/pub/protocol.ts";
import { api, jsonBody } from "../../../src/common/http.server.ts";
import { myLinks, saveLinks } from "../../../src/model/person/feature/settings/settings.server.ts";

export const GET = defineHandler((c) => api(() => myLinks(c), c.req.raw));

export const PUT = defineHandler((c) =>
  api(async () => saveLinks(c, (await jsonBody(c, ProfileLinks)).links), c.req.raw),
);
