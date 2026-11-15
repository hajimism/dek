import { defineHandler } from "void";
import { api } from "../../../src/common/http.server.ts";
import { askHandle } from "../../../src/model/person/feature/choose-handle/handle.server.ts";

/** Whether a handle may be chosen, as protocol HandleStatus; for the page to choose one on. */
export const GET = defineHandler((c) =>
  api(() => askHandle(c, c.req.param("handle") ?? ""), c.req.raw),
);
