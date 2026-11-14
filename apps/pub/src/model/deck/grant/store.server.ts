// Grants in D1. A grant by email address waits for an account to show it owns the address; it is
// then claimed for that account, by claimGrants, so later it holds even if the address changes.
// That happens when the account signs in, or when the grant is made to an address an account has
// verified already; reading a deck never writes (ADR 73).

import { grants } from "@schema";
import type { Context } from "hono";
import { and, asc, db, eq, isNull, notInArray, or } from "void/db";
import { ApiError } from "../../../common/api-error.ts";
import { newGrantId } from "../../../common/ids.ts";
import { peopleById, personByEmail, personByHandle } from "../../person/store.server.ts";
import type { Person } from "../../person/type.ts";
import type { Grantee, GrantRole, GrantRow, GrantSide, GrantView } from "./type.ts";

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

/**
 * Tie the grants waiting on `person`'s address to their account, on every deck or on `deckId`'s,
 * once they have verified the address. A deck on which the account already holds a grant by
 * handle keeps that one tied, as one account can hold only one: the grant by address beside it
 * keeps waiting, and still counts while the address is theirs.
 */
export async function claimGrants(person: Person, deckId?: string): Promise<void> {
  if (!person.emailVerified) {
    return;
  }
  const held = db
    .select({ deckId: grants.deckId })
    .from(grants)
    .where(eq(grants.userId, person.id));
  await db
    .update(grants)
    .set({ userId: person.id })
    .where(
      and(
        eq(grants.email, person.email.toLowerCase()),
        isNull(grants.userId),
        notInArray(grants.deckId, held),
        deckId ? eq(grants.deckId, deckId) : undefined,
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
    side: row.side,
    createdAt: row.createdAt,
  }));
}

function granteeName(grantee: Grantee): string {
  return "email" in grantee ? grantee.email : grantee.handle;
}

/** Whom a new share is to be mailed to, or null when it changed one that was there already. */
export type Invite = { to: string; byEmail: boolean };

/**
 * Share a deck with one person, or change what an earlier share allows them. A new share lets them
 * view, on the guests' side, unless `role` or `side` says otherwise; an earlier one keeps what
 * they leave out.
 */
export async function share(
  c: Context,
  deck: { id: string; ownerId: string },
  grantee: Grantee,
  role?: GrantRole,
  side?: GrantSide,
): Promise<{ grant: GrantView; invite: Invite | null }> {
  let target: { userId: string | null; email: string | null };
  let address: string;
  if ("email" in grantee) {
    target = { userId: null, email: grantee.email };
    address = grantee.email;
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
    address = person.email;
  }
  const match = and(
    eq(grants.deckId, deck.id),
    target.userId ? eq(grants.userId, target.userId) : eq(grants.email, target.email ?? ""),
  );
  const before = await db.select({ id: grants.id }).from(grants).where(match).get();
  const id = newGrantId();
  const change = { ...(role ? { role } : {}), ...(side ? { side } : {}) };
  const insert = db
    .insert(grants)
    .values({ id, deckId: deck.id, ...target, role: role ?? "view", side: side ?? "guest" });
  await (Object.keys(change).length === 0
    ? insert.onConflictDoNothing()
    : insert.onConflictDoUpdate({
        target: target.userId ? [grants.deckId, grants.userId] : [grants.deckId, grants.email],
        set: change,
      }));
  const holder = "email" in grantee ? await personByEmail(c, grantee.email) : null;
  if (holder && holder.id !== deck.ownerId) {
    await claimGrants(holder, deck.id);
  }
  const row = await db
    .select({
      id: grants.id,
      userId: grants.userId,
      role: grants.role,
      side: grants.side,
      createdAt: grants.createdAt,
    })
    .from(grants)
    .where(match)
    .get();
  return {
    grant: {
      id: row?.id ?? id,
      who: holder && row?.userId === holder.id ? holder.handle : granteeName(grantee),
      role: row?.role ?? role ?? "view",
      side: row?.side ?? side ?? "guest",
      createdAt: row?.createdAt ?? "",
    },
    invite: before ? null : { to: address, byEmail: "email" in grantee },
  };
}

/** Whether a grant on any deck waits for `email`, as one that may sign in by a link. */
export async function hasWaitingGrant(email: string): Promise<boolean> {
  const row = await db
    .select({ id: grants.id })
    .from(grants)
    .where(and(eq(grants.email, email.toLowerCase()), isNull(grants.userId)))
    .get();
  return row !== undefined;
}

export async function unshare(deckId: string, grantId: string): Promise<void> {
  await db.delete(grants).where(and(eq(grants.deckId, deckId), eq(grants.id, grantId)));
}
