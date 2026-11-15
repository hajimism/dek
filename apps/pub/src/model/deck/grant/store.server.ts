// Grants in D1. A grant by email address waits for an account to show it owns the address; it is
// then claimed for that account, by claimGrants, so later it holds even if the address changes.
// That happens when the account signs in, or when the grant is made to an address an account has
// verified already; reading a deck never writes (ADR 73).

import { decks, grants, invitations } from "@schema";
import type { Context } from "hono";
import { and, asc, db, eq, gt, isNull, lte, notInArray, or, sql } from "void/db";
import { ApiError } from "../../../common/api-error.ts";
import { newGrantId } from "../../../common/ids.ts";
import { accountByEmail, peopleById, personByHandle } from "../../person/store.server.ts";
import type { Account } from "../../person/type.ts";
import {
  INVITATIONS_PER_WINDOW,
  invitationsFreeAt,
  invitationWindowStart,
  utcMinute,
} from "./grant.ts";
import type { Grantee, GrantRole, GrantRow, GrantSide, GrantView } from "./type.ts";

/** The grants that name `person` on a deck: by account, or by an address they have verified. */
export async function grantsOf(
  deckId: string,
  person: Pick<Account, "id" | "email" | "emailVerified"> | null,
): Promise<GrantRow[]> {
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
export async function claimGrants(
  person: Pick<Account, "id" | "email" | "emailVerified">,
  deckId?: string,
): Promise<void> {
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

/**
 * The people a deck is shared with, oldest grant first: by handle, or by the address a grant
 * waits on, or was claimed by an account that has no handle yet.
 */
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
    who: (row.userId ? people.get(row.userId)?.handle : undefined) ?? row.email ?? row.userId ?? "",
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
 * they leave out. A new share takes one of the owner's invitations first, and is not made when
 * none is left.
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
  if (!before) {
    await takeInvitation(deck.ownerId);
  }
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
  const holder = "email" in grantee ? await accountByEmail(c, grantee.email) : null;
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
      who: (holder && row?.userId === holder.id ? holder.handle : null) ?? granteeName(grantee),
      role: row?.role ?? role ?? "view",
      side: row?.side ?? side ?? "guest",
      createdAt: row?.createdAt ?? "",
    },
    invite: before ? null : { to: address, byEmail: "email" in grantee },
  };
}

/**
 * Count one invitation against `inviterId`, or refuse with a 429 that says when the next may go.
 * The count and the row are one statement, so requests that come at once, to any isolate, cannot
 * pass the limit together; rows that have left the window are deleted on the way.
 */
async function takeInvitation(inviterId: string): Promise<void> {
  const now = new Date();
  const since = invitationWindowStart(now);
  const [, taken] = await db.batch([
    db
      .delete(invitations)
      .where(and(eq(invitations.inviterId, inviterId), lte(invitations.createdAt, since))),
    db
      .insert(invitations)
      .select(
        sql`select ${inviterId}, ${now.toISOString()} where (select count(*) from ${invitations} where ${invitations.inviterId} = ${inviterId} and ${invitations.createdAt} > ${since}) < ${INVITATIONS_PER_WINDOW}`,
      )
      .returning({ inviterId: invitations.inviterId }),
  ]);
  if (taken.length > 0) {
    return;
  }
  const sent = await db
    .select({ at: invitations.createdAt })
    .from(invitations)
    .where(and(eq(invitations.inviterId, inviterId), gt(invitations.createdAt, since)));
  // Null only when invitations left the window since the count; one may go now, then.
  const next =
    invitationsFreeAt(
      sent.map((row) => row.at),
      now,
    ) ?? now;
  throw new ApiError(
    429,
    "invitations_exhausted",
    `your shares mailed ${INVITATIONS_PER_WINDOW} invitations in the last 24 hours, as many as dek.pub sends for one person`,
    `share with someone new after ${utcMinute(next)}; a change to a share mails nothing and can be made now`,
  );
}

/**
 * Whether a grant on any deck waits for `email`, as one that may sign in by a link. Only a deck
 * that is there counts: a grant made while its deck was being deleted can outlive it (ADR 82), and
 * would otherwise let its address make an account.
 */
export async function hasWaitingGrant(email: string): Promise<boolean> {
  const row = await db
    .select({ id: grants.id })
    .from(grants)
    .innerJoin(decks, eq(decks.id, grants.deckId))
    .where(and(eq(grants.email, email.toLowerCase()), isNull(grants.userId)))
    .get();
  return row !== undefined;
}

export async function unshare(deckId: string, grantId: string): Promise<void> {
  await db.delete(grants).where(and(eq(grants.deckId, deckId), eq(grants.id, grantId)));
}
