// What a grant means: whom it names and how much it allows.

import { isHandle } from "../../person/handle.ts";
import type { Grantee, GrantRole, GrantSide } from "./type.ts";

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

/** Of the grants one person holds on a deck, the side that sees more counts. */
export function widestSide(sides: readonly GrantSide[]): GrantSide | null {
  if (sides.includes("team")) {
    return "team";
  }
  return sides.length > 0 ? "guest" : null;
}

/**
 * The most invitations the grants of one owner mail in any INVITATION_WINDOW_MS: every new grant
 * mails one, by handle or by address, and so takes one; a change to a grant mails none (ADR 84).
 */
export const INVITATIONS_PER_WINDOW = 20;

export const INVITATION_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * The time after which an invitation counts at `now`, written as the tables write times: ISO 8601
 * in UTC to the millisecond, so that times compare as text.
 */
export function invitationWindowStart(now: Date): string {
  return new Date(now.getTime() - INVITATION_WINDOW_MS).toISOString();
}

/**
 * When an owner who sent invitations at `sent` may send the next, or null when they may now: once
 * enough of those in the window have left it to bring them under the limit.
 */
export function invitationsFreeAt(sent: readonly string[], now: Date): Date | null {
  const since = invitationWindowStart(now);
  const counted = sent.filter((at) => at > since).sort();
  if (counted.length < INVITATIONS_PER_WINDOW) {
    return null;
  }
  const last = counted[counted.length - INVITATIONS_PER_WINDOW] ?? since;
  return new Date(Date.parse(last) + INVITATION_WINDOW_MS);
}

/** A time as "2026-11-15 09:13 UTC", rounded up to the minute, so it is never too early. */
export function utcMinute(at: Date): string {
  const minute = 60_000;
  const up = new Date(Math.ceil(at.getTime() / minute) * minute).toISOString();
  return `${up.slice(0, 10)} ${up.slice(11, 16)} UTC`;
}
