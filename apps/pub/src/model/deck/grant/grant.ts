// What a grant means: whom it names and how much it allows.

import { isHandle } from "../../person/handle.ts";
import type { Grantee, GrantRole } from "./type.ts";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Whom the owner named when sharing: `@handle`, `handle`, or an email address; null for neither. */
export function granteeOf(who: string): Grantee | null {
  const name = who.replace(/^@/, "").toLowerCase();
  if (EMAIL_RE.test(name)) {
    return { email: name };
  }
  return isHandle(name) ? { handle: name } : null;
}

/** Of the grants one person holds on a deck, the one that allows more counts. */
export function strongestRole(roles: readonly GrantRole[]): GrantRole | null {
  if (roles.includes("comment")) {
    return "comment";
  }
  return roles.length > 0 ? "view" : null;
}

/**
 * The grants by address among `rows` to tie to `userId`'s account. A grant the account already
 * holds by handle on the same deck stays the one that is tied: two grants for one account on one
 * deck cannot both be. The one by address keeps waiting, and still counts while the address is
 * theirs.
 */
export function waitingGrants<T extends { deckId: string; userId: string | null }>(
  rows: readonly T[],
  userId: string,
): T[] {
  const byAccount = new Set(rows.filter((row) => row.userId === userId).map((row) => row.deckId));
  return rows.filter((row) => row.userId === null && !byAccount.has(row.deckId));
}
