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

/** Better Auth reads 100 rows of a query that names no limit, so the list reads a page at a time. */
const PAGE = 100;

/** The keys of the account `userId` that still work, newest first. */
export async function keysOf(c: Context, userId: string): Promise<CliKeyInfo[]> {
  const { adapter } = await authOf(c).$context;
  const rows: unknown[] = [];
  for (;;) {
    const page = await adapter.findMany({
      model: "apikey",
      where: [{ field: "referenceId", value: userId }],
      sortBy: { field: "createdAt", direction: "desc" },
      limit: PAGE,
      offset: rows.length,
    });
    rows.push(...page);
    if (page.length < PAGE) {
      break;
    }
  }
  const now = Date.now();
  return KeyRow.array()
    .parse(rows)
    .filter((row) => row.expiresAt == null || row.expiresAt.getTime() > now)
    .map((row) => ({
      id: row.id,
      name: row.name ?? null,
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastRequest?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    }));
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
 * Revoke every key of the account, past their expiry too; how many of them still worked. Only keys
 * made before the call are revoked, so a key made while it runs stays.
 */
export async function revokeKeysOf(c: Context, userId: string): Promise<number> {
  const now = new Date();
  const { adapter } = await authOf(c).$context;
  const before = [
    { field: "referenceId", value: userId },
    { field: "createdAt", operator: "lte", value: now },
  ] as const;
  await adapter.deleteMany({
    model: "apikey",
    where: [...before, { field: "expiresAt", operator: "lte", value: now }],
  });
  return adapter.deleteMany({ model: "apikey", where: [...before] });
}
