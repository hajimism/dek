// Accounts are Better Auth's; these read them through its adapter, so dek.pub never depends on how
// Void names the auth tables or their columns.

import type { Context } from "hono";
import { authOf } from "../../common/void-auth.server.ts";
import { hasHandle, readAccount } from "./person.ts";
import type { Account, Person } from "./type.ts";

/** A Better Auth record as a person: null for one that is no account, or has no handle yet. */
function personOf(user: unknown): Person | null {
  const account = user ? readAccount(user) : null;
  return account && hasHandle(account) ? account : null;
}

export async function personByHandle(c: Context, handle: string): Promise<Person | null> {
  const context = await authOf(c).$context;
  const user = await context.adapter.findOne({
    model: "user",
    where: [{ field: "handle", value: handle }],
  });
  return personOf(user);
}

export async function accountByEmail(c: Context, email: string): Promise<Account | null> {
  const context = await authOf(c).$context;
  const user = await context.adapter.findOne({
    model: "user",
    where: [{ field: "email", value: email.toLowerCase() }],
  });
  return user ? readAccount(user) : null;
}

export async function accountById(c: Context, id: string): Promise<Account | null> {
  const context = await authOf(c).$context;
  const user = await context.internalAdapter.findUserById(id);
  return user ? readAccount(user) : null;
}

export async function personById(c: Context, id: string): Promise<Person | null> {
  return personOf(await accountById(c, id));
}

/**
 * Give the account `handle`, if it has none yet: "set"; "chosen" when it had one, which stays.
 * Two accounts asking for one handle at once both pass any check before, so the unique index
 * decides: the one refused finds it `taken`.
 */
export async function setHandle(
  c: Context,
  id: string,
  handle: string,
): Promise<"set" | "chosen" | "taken"> {
  const context = await authOf(c).$context;
  try {
    const changed: number = await context.adapter.updateMany({
      model: "user",
      where: [
        { field: "id", value: id },
        { field: "handle", value: null },
      ],
      update: { handle, updatedAt: new Date() },
    });
    return changed > 0 ? "set" : "chosen";
  } catch (error) {
    const holder = await personByHandle(c, handle);
    if (holder !== null && holder.id !== id) {
      return "taken";
    }
    throw error;
  }
}

/** Give the account `name`, which `readName` read. */
export async function setName(c: Context, id: string, name: string): Promise<void> {
  const context = await authOf(c).$context;
  await context.adapter.updateMany({
    model: "user",
    where: [{ field: "id", value: id }],
    update: { name, updatedAt: new Date() },
  });
}

/** How many IDs one query asks for: D1 binds at most 100 values to a statement. */
const IDS_PER_QUERY = 90;

/** The people among `ids`; an account with no handle yet is among none. */
export async function peopleById(c: Context, ids: readonly string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Map();
  }
  const context = await authOf(c).$context;
  const batches: string[][] = [];
  for (let at = 0; at < unique.length; at += IDS_PER_QUERY) {
    batches.push(unique.slice(at, at + IDS_PER_QUERY));
  }
  const found = await Promise.all(
    batches.map(
      (batch) =>
        context.adapter.findMany({
          model: "user",
          where: [{ field: "id", operator: "in", value: batch }],
        }) as Promise<unknown[]>,
    ),
  );
  const people = found.flat().flatMap((user) => personOf(user) ?? []);
  return new Map(people.map((person) => [person.id, person]));
}
