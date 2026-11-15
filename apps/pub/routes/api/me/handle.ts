import { defineHandler } from "void";
import { ChooseHandle } from "../../../../../src/pub/protocol.ts";
import { api, jsonBody } from "../../../src/common/http.server.ts";
import { chooseHandle } from "../../../src/model/person/feature/choose-handle/handle.server.ts";

/** Choose the handle, once, as protocol ChooseHandle; the answer is Me. */
export const PUT = defineHandler((c) =>
  api(async () => chooseHandle(c, (await jsonBody(c, ChooseHandle)).handle), c.req.raw),
);
