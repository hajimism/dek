// The API keys the CLI holds, made and checked with Better Auth's api-key plugin. A key is checked
// by dek.pub's own API rather than turned into a session for every endpoint, so only that API
// accepts it.

import type { Context } from "hono";
import type { CliKeyInfo } from "../../../../../src/pub/protocol.ts";
import { authOf } from "../../common/void-auth.server.ts";
import { KeyCheck, KeyRow, MadeKey } from "./type.ts";

/** A key lasts a year; `dekc pub login` makes a new one. */
const KEY_SECONDS = 365 * 24 * 60 * 60;

/** The key's ID and the account it belongs to, if it is a valid key. */
export async function checkKey(
  c: Context,
  key: string,
): Promise<{ id: string; userId: string } | null> {
  const checked = KeyCheck.safeParse(await authOf(c).api.verifyApiKey({ body: { key } }));
  if (!checked.success) {
    return null;
  }
  const result = checked.data;
  const userId = result.key?.referenceId ?? result.key?.userId;
  return result.valid && result.key && userId ? { id: result.key.id, userId } : null;
}

export async function makeKey(c: Context, userId: string, name: string): Promise<string> {
  const created = await authOf(c).api.createApiKey({
    body: { userId, name, expiresIn: KEY_SECONDS },
  });
  return MadeKey.parse(created).key;
}

// Better Auth's own routes to list and delete keys take a session alone, and a key revokes its
// account's keys too, so both go through its adapter, by the account the key belongs to.

/** The account's keys `rows` reads, newest first, leaving out those past their expiry. */
function liveKeys(rows: unknown, now: number): CliKeyInfo[] {
  return KeyRow.array()
    .parse(rows)
    .filter((row) => row.expiresAt == null || row.expiresAt.getTime() > now)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((row) => ({
      id: row.id,
      name: row.name ?? null,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastRequest?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    }));
}

async function rowsOf(c: Context, userId: string): Promise<unknown> {
  const context = await authOf(c).$context;
  return context.adapter.findMany({
    model: "apikey",
    where: [{ field: "referenceId", value: userId }],
  });
}

/** The keys of the account `userId` that still work, newest first. */
export async function keysOf(c: Context, userId: string): Promise<CliKeyInfo[]> {
  return liveKeys(await rowsOf(c, userId), Date.now());
}

/** Revoke the key `id` if it is the account's; whether there was one to revoke. */
export async function revokeKeyOf(c: Context, userId: string, id: string): Promise<boolean> {
  const context = await authOf(c).$context;
  const where = [
    { field: "id", value: id },
    { field: "referenceId", value: userId },
  ];
  if ((await context.adapter.count({ model: "apikey", where })) === 0) {
    return false;
  }
  await context.adapter.deleteMany({ model: "apikey", where });
  return true;
}

/**
 * Revoke every key of the account, past their expiry too; how many of them still worked. A key
 * made while this runs is not among them, and stays.
 */
export async function revokeKeysOf(c: Context, userId: string): Promise<number> {
  const rows = await rowsOf(c, userId);
  const ids = KeyRow.pick({ id: true })
    .array()
    .parse(rows)
    .map((row) => row.id);
  if (ids.length === 0) {
    return 0;
  }
  const context = await authOf(c).$context;
  await context.adapter.deleteMany({
    model: "apikey",
    where: [
      { field: "id", operator: "in", value: ids },
      { field: "referenceId", value: userId },
    ],
  });
  return liveKeys(rows, Date.now()).length;
}
