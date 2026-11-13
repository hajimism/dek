// The CLI's API key. `dekc pub login` ends the device flow with a session token and trades it
// for a key that lasts; `dekc pub logout` revokes the key it holds.

import type { Context } from "hono";
import { API_KEY_HEADER, type CliKey } from "../../../../../../../src/pub/protocol.ts";
import { ApiError } from "../../../../common/api-error.ts";
import { authOf } from "../../../../common/void-auth.server.ts";
import { requirePerson } from "../../actor.server.ts";
import { checkKey, makeKey, revokeKey } from "../../api-key.server.ts";
import { meOf } from "../../person.ts";

export async function tradeSessionForKey(c: Context): Promise<CliKey> {
  if (!c.get("user")) {
    throw new ApiError(
      401,
      "signed_out",
      "trade a device-flow session for a key",
      "run `dekc pub login`",
    );
  }
  const person = await requirePerson(c);
  const agent = c.req.header("user-agent") ?? "dekc";
  const key = await makeKey(c, person.id, `dekc (${agent.slice(0, 60)})`);
  // The device flow's session existed only to be traded for the key; it ends here.
  const session = c.get("session") as { token?: string } | null;
  if (session?.token && c.req.header("authorization")?.startsWith("Bearer ")) {
    const context = await authOf(c).$context;
    await context.internalAdapter.deleteSession(session.token);
  }
  return { key, me: meOf(person) };
}

/** Revoke the key the request carries, and only that one. */
export async function revokeCallersKey(c: Context): Promise<{ revoked: boolean }> {
  const key = c.req.header(API_KEY_HEADER);
  if (!key) {
    throw new ApiError(401, "signed_out", "send the key to revoke");
  }
  const checked = await checkKey(c, key);
  if (checked) {
    await revokeKey(c, checked.id);
  }
  return { revoked: checked !== null };
}
