import { defineHandler } from "void";
import { api } from "../../../src/common/http.server.ts";
import {
  revokeCallersKey,
  tradeSessionForKey,
} from "../../../src/model/person/feature/connect-cli/key.server.ts";

export const POST = defineHandler((c) => api(() => tradeSessionForKey(c), c.req.raw));

export const DELETE = defineHandler((c) => api(() => revokeCallersKey(c), c.req.raw));
