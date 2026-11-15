import { defineHandler } from "void";
import { api } from "../../../src/common/http.server.ts";
import { myKeys, revokeMyKeys } from "../../../src/model/person/feature/settings/keys.server.ts";

/** The person's CLI keys, as protocol CliKeys; a browser's session only. */
export const GET = defineHandler((c) => api(() => myKeys(c), c.req.raw));

/** Revoke every one of them, as protocol KeysRevoked; a session, or any of the keys. */
export const DELETE = defineHandler((c) => api(() => revokeMyKeys(c), c.req.raw));
