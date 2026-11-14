// The entries an operator invites people to sign up by, in D1's `sign_up_invites` (ADR 85). An
// entry no account has claimed lets in the account it names; the first made for it claims it, and
// from then on it lets no one else in and stays, as a record of who came in by it.

import { signUpInvites } from "@schema";
import { and, db, desc, eq, inArray, isNull } from "void/db";
import { newSignUpInviteId } from "../../common/ids.ts";
import type { SignUpInviteRow } from "./type.ts";

/** Every entry, the newest first. */
export async function signUpInvitesAll(): Promise<SignUpInviteRow[]> {
  return db.select().from(signUpInvites).orderBy(desc(signUpInvites.createdAt)).all();
}

/**
 * Add `entries`, which `readInviteEntries` read, as `operatorId`'s; an entry there already, claimed
 * or not, stays as it was. Answers the entries that are new, which are the ones to mail. Each goes
 * in a statement of its own, in one batch, so a long list binds no more values to one than D1 takes.
 */
export async function addSignUpInvites(
  entries: readonly string[],
  operatorId: string,
): Promise<string[]> {
  const [first, ...rest] = entries.map((entry) =>
    db
      .insert(signUpInvites)
      .values({ id: newSignUpInviteId(), entry, addedBy: operatorId })
      .onConflictDoNothing()
      .returning({ entry: signUpInvites.entry }),
  );
  if (!first) {
    return [];
  }
  const added = await db.batch([first, ...rest]);
  return added.flat().map((row) => row.entry);
}

/** Remove an entry no account has claimed: "claimed" leaves one that has, "missing" is for none. */
export async function removeSignUpInvite(id: string): Promise<"removed" | "claimed" | "missing"> {
  const removed = await db
    .delete(signUpInvites)
    .where(and(eq(signUpInvites.id, id), isNull(signUpInvites.claimedBy)))
    .returning({ id: signUpInvites.id });
  if (removed.length > 0) {
    return "removed";
  }
  const left = await db
    .select({ id: signUpInvites.id })
    .from(signUpInvites)
    .where(eq(signUpInvites.id, id))
    .get();
  return left ? "claimed" : "missing";
}

/** Whether an entry no account has claimed is any of `entries`. */
export async function hasOpenSignUpInvite(entries: readonly string[]): Promise<boolean> {
  const row = await db
    .select({ id: signUpInvites.id })
    .from(signUpInvites)
    .where(and(inArray(signUpInvites.entry, [...entries]), isNull(signUpInvites.claimedBy)))
    .get();
  return row !== undefined;
}

/** Mark each entry among `entries` that no account had claimed as claimed by `accountId`, now. */
export async function claimSignUpInvites(
  accountId: string,
  entries: readonly string[],
): Promise<void> {
  if (entries.length === 0) {
    return;
  }
  await db
    .update(signUpInvites)
    .set({ claimedBy: accountId, claimedAt: new Date().toISOString() })
    .where(and(inArray(signUpInvites.entry, [...entries]), isNull(signUpInvites.claimedBy)));
}
