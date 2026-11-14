// Accounts are Better Auth's; these read them through its adapter, so dek.pub never depends on how
// Void names the auth tables or their columns.

import type { Context } from "hono";
import { authOf } from "../../common/void-auth.server.ts";
import { readAccount } from "./person.ts";
import type { Person } from "./type.ts";

export async function personByHandle(c: Context, handle: string): Promise<Person | null> {
  const context = await authOf(c).$context;
  const user = await context.adapter.findOne({
    model: "user",
    where: [{ field: "handle", value: handle }],
  });
  return user ? readAccount(user) : null;
}

export async function personByEmail(c: Context, email: string): Promise<Person | null> {
  const context = await authOf(c).$context;
  const user = await context.adapter.findOne({
    model: "user",
    where: [{ field: "email", value: email.toLowerCase() }],
  });
  return user ? readAccount(user) : null;
}

export async function personById(c: Context, id: string): Promise<Person | null> {
  const context = await authOf(c).$context;
  const user = await context.internalAdapter.findUserById(id);
  return user ? readAccount(user) : null;
}

/** How many IDs one query asks for: D1 binds at most 100 values to a statement. */
const IDS_PER_QUERY = 90;

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
  const people = found.flat().flatMap((user) => readAccount(user) ?? []);
  return new Map(people.map((person) => [person.id, person]));
}
