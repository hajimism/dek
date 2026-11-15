// A person's CLI keys, as the settings page lists and revokes them. Listing them, or revoking one,
// takes the browser's session; revoking them all, a key may do too, as `dekc pub logout --all`
// does from any machine still signed in when a key has leaked (ADR 83).

import type { Context } from "hono";
import type { CliKeys, KeysRevoked } from "../../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../../common/api-error.ts";
import { requirePerson, requireSessionPerson } from "../../actor.server.ts";
import { keysOf, revokeKeyOf, revokeKeysOf } from "../../api-key.server.ts";

export async function myKeys(c: Context): Promise<CliKeys> {
  const person = await requireSessionPerson(c);
  return { keys: await keysOf(c, person.id) };
}

/** Revoke one of the person's keys; one that is not theirs, or is gone, is a 404. */
export async function revokeMyKey(c: Context, id: string): Promise<KeysRevoked> {
  const person = await requireSessionPerson(c);
  if (!(await revokeKeyOf(c, person.id, id))) {
    throw new ApiError(404, "key_not_found", "no such key of yours");
  }
  return { revoked: 1 };
}

/** Revoke every key of the person's, the one the call carries included. */
export async function revokeMyKeys(c: Context): Promise<KeysRevoked> {
  const person = await requirePerson(c);
  return { revoked: await revokeKeysOf(c, person.id) };
}
