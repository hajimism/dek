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

/**
 * Whether the person signs in with GitHub. An account made that way took its handle from the
 * GitHub login; one made by a sign-in link took it from the address and links to no GitHub page.
 */
export async function signsInWithGitHub(c: Context, person: Person): Promise<boolean> {
  const context = await authOf(c).$context;
  const account = await context.adapter.findOne({
    model: "account",
    where: [
      { field: "userId", value: person.id },
      { field: "providerId", value: "github" },
    ],
  });
  return account !== null;
}

export async function personById(c: Context, id: string): Promise<Person | null> {
  const context = await authOf(c).$context;
  const user = await context.internalAdapter.findUserById(id);
  return user ? readAccount(user) : null;
}

export async function peopleById(c: Context, ids: readonly string[]): Promise<Map<string, Person>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) {
    return new Map();
  }
  const context = await authOf(c).$context;
  const users = (await context.adapter.findMany({
    model: "user",
    where: [{ field: "id", operator: "in", value: unique }],
  })) as unknown[];
  const people = users.flatMap((user) => readAccount(user) ?? []);
  return new Map(people.map((person) => [person.id, person]));
}
