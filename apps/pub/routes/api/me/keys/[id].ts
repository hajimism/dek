import { defineHandler } from "void";
import { api } from "../../../../src/common/http.server.ts";
import { revokeMyKey } from "../../../../src/model/person/feature/settings/keys.server.ts";

/** Revoke one CLI key, as protocol KeysRevoked; a browser's session only. */
export const DELETE = defineHandler((c) =>
  api(() => revokeMyKey(c, c.req.param("id") ?? ""), c.req.raw),
);
