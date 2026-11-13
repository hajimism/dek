// The API keys the CLI holds, made and checked with Better Auth's api-key plugin. A key is checked
// by dek.pub's own API rather than turned into a session for every endpoint, so only that API
// accepts it.

import type { Context } from "hono";
import { z } from "zod";
import { authOf } from "../../common/void-auth.server.ts";

/** A key lasts a year; `dekc pub login` makes a new one. */
const KEY_SECONDS = 365 * 24 * 60 * 60;

const KeyCheck = z.object({
  valid: z.boolean(),
  key: z
    .object({ id: z.string(), referenceId: z.string().nullish(), userId: z.string().nullish() })
    .nullish(),
});

/** The key's ID and the account it belongs to, if it is a valid key. */
export async function checkKey(
  c: Context,
  key: string,
): Promise<{ id: string; userId: string } | null> {
  const result = KeyCheck.parse(await authOf(c).api.verifyApiKey({ body: { key } }));
  const userId = result.key?.referenceId ?? result.key?.userId;
  return result.valid && result.key && userId ? { id: result.key.id, userId } : null;
}

export async function makeKey(c: Context, userId: string, name: string): Promise<string> {
  const created = z
    .object({ key: z.string() })
    .parse(await authOf(c).api.createApiKey({ body: { userId, name, expiresIn: KEY_SECONDS } }));
  return created.key;
}

export async function revokeKey(c: Context, id: string): Promise<void> {
  const context = await authOf(c).$context;
  await context.adapter.delete({ model: "apikey", where: [{ field: "id", value: id }] });
}
