// A person's profile links, kept in dek.pub's own table by their account's ID, one row a link.

import { profileLinks } from "@schema";
import { asc, db, eq } from "void/db";
import { firstLinks } from "./link.ts";
import { readAccount } from "./person.ts";

/** The account's links, in the order they put them. */
export async function linksOf(userId: string): Promise<string[]> {
  const rows = await db
    .select({ url: profileLinks.url })
    .from(profileLinks)
    .where(eq(profileLinks.userId, userId))
    .orderBy(asc(profileLinks.position))
    .all();
  return rows.map((row) => row.url);
}

/** Make `links`, which `readLinks` read, the account's: all of them, in one batch, in their order. */
export async function setLinks(userId: string, links: readonly string[]): Promise<void> {
  const clear = db.delete(profileLinks).where(eq(profileLinks.userId, userId));
  if (links.length === 0) {
    await clear;
    return;
  }
  await db.batch([
    clear,
    db.insert(profileLinks).values(links.map((url, position) => ({ userId, position, url }))),
  ]);
}

/** Give an account Better Auth has just made the links it starts with, if any. */
export async function seedLinks(user: unknown): Promise<void> {
  const account = user ? readAccount(user) : null;
  const links = account ? firstLinks(account) : [];
  if (account && links.length > 0) {
    await setLinks(account.id, links);
  }
}
