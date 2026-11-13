// Grants in D1. A grant by email address waits for an account to show it owns the address; it is
// then claimed for that account, by claimGrants, so later it holds even if the address changes.

import { grants } from "@schema";
import type { Context } from "hono";
import { and, asc, db, eq, inArray, or } from "void/db";
import { ApiError } from "../../../common/api-error.ts";
import { newGrantId } from "../../../common/ids.ts";
import { peopleById, personByHandle } from "../../person/store.server.ts";
import type { Person } from "../../person/type.ts";
import { strongestRole } from "./grant.ts";
import type { Grantee, GrantRole, GrantRow, GrantView } from "./type.ts";

/** The grants that name `person` on a deck: by account, or by an address they have verified. */
export async function grantsOf(deckId: string, person: Person | null): Promise<GrantRow[]> {
  if (!person) {
    return [];
  }
  const email = person.emailVerified ? person.email.toLowerCase() : undefined;
  const match = email
    ? or(eq(grants.userId, person.id), eq(grants.email, email))
    : eq(grants.userId, person.id);
  return db
    .select()
    .from(grants)
    .where(and(eq(grants.deckId, deckId), match))
    .all();
}

export function roleOf(rows: readonly GrantRow[]): GrantRole | null {
  return strongestRole(rows.map((row) => row.role));
}

/**
 * Tie the grants by address among `rows` to `person`'s account. A grant the account already holds
 * by handle on the same deck stays the one that is tied; the one by address keeps waiting, and
 * still counts while the address is theirs.
 */
export async function claimGrants(rows: readonly GrantRow[], person: Person): Promise<void> {
  const byAccount = new Set(
    rows.filter((row) => row.userId === person.id).map((row) => row.deckId),
  );
  const waiting = rows.filter((row) => row.userId === null && !byAccount.has(row.deckId));
  if (waiting.length === 0) {
    return;
  }
  await db
    .update(grants)
    .set({ userId: person.id })
    .where(
      inArray(
        grants.id,
        waiting.map((row) => row.id),
      ),
    );
}

/** The people a deck is shared with, oldest grant first. */
export async function grantList(c: Context, deckId: string): Promise<GrantView[]> {
  const rows = await db
    .select()
    .from(grants)
    .where(eq(grants.deckId, deckId))
    .orderBy(asc(grants.createdAt))
    .all();
  const people = await peopleById(
    c,
    rows.flatMap((row) => (row.userId ? [row.userId] : [])),
  );
  return rows.map((row) => ({
    id: row.id,
    who: row.userId ? (people.get(row.userId)?.handle ?? row.userId) : (row.email ?? ""),
    role: row.role,
    createdAt: row.createdAt,
  }));
}

/** Share a deck with one person, or change what an earlier share allows them. */
export async function share(
  c: Context,
  deck: { id: string; ownerId: string },
  grantee: Grantee,
  role: GrantRole,
): Promise<GrantView> {
  let target: { userId: string | null; email: string | null };
  if ("email" in grantee) {
    target = { userId: null, email: grantee.email };
  } else {
    const person = await personByHandle(c, grantee.handle);
    if (!person) {
      throw new ApiError(
        404,
        "no_such_person",
        `no one on dek.pub is @${grantee.handle}`,
        "share by email address instead",
      );
    }
    if (person.id === deck.ownerId) {
      throw new ApiError(422, "owner", "the deck is already yours");
    }
    target = { userId: person.id, email: null };
  }
  const id = newGrantId();
  await db
    .insert(grants)
    .values({ id, deckId: deck.id, ...target, role })
    .onConflictDoUpdate({
      target: target.userId ? [grants.deckId, grants.userId] : [grants.deckId, grants.email],
      set: { role },
    });
  const row = await db
    .select({ id: grants.id, createdAt: grants.createdAt })
    .from(grants)
    .where(
      and(
        eq(grants.deckId, deck.id),
        target.userId ? eq(grants.userId, target.userId) : eq(grants.email, target.email ?? ""),
      ),
    )
    .get();
  return {
    id: row?.id ?? id,
    who: "email" in grantee ? grantee.email : grantee.handle,
    role,
    createdAt: row?.createdAt ?? "",
  };
}

export async function unshare(deckId: string, grantId: string): Promise<void> {
  await db.delete(grants).where(and(eq(grants.deckId, deckId), eq(grants.id, grantId)));
}
