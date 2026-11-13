// Accounts are Better Auth's; these read them through its adapter, so dek.pub never depends on how
// Void names the auth tables or their columns.

import type { Context } from "hono";
import { authOf } from "../../common/void-auth.server.ts";
import type { Person } from "../deck/access.ts";

type UserRecord = {
  id: string;
  name: string;
  email: string;
  image?: string | null;
  handle?: string | null;
};

export type Account = Person & { email: string; image: string | null };

function account(user: UserRecord): Account {
  return {
    id: user.id,
    name: user.name,
    handle: user.handle ?? user.id,
    email: user.email,
    image: user.image ?? null,
  };
}

export async function userByHandle(c: Context, handle: string): Promise<Account | null> {
  const context = await authOf(c).$context;
  const user = (await context.adapter.findOne({
    model: "user",
    where: [{ field: "handle", value: handle }],
  })) as UserRecord | null;
  return user ? account(user) : null;
}

export async function userById(c: Context, id: string): Promise<Account | null> {
  const context = await authOf(c).$context;
  const user = (await context.internalAdapter.findUserById(id)) as UserRecord | null;
  return user ? account(user) : null;
}

export async function usersById(c: Context, ids: readonly string[]): Promise<Map<string, Account>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Map();
  }
  const context = await authOf(c).$context;
  const users = (await context.adapter.findMany({
    model: "user",
    where: [{ field: "id", operator: "in", value: unique }],
  })) as UserRecord[];
  return new Map(users.map((user) => [user.id, account(user)]));
}
