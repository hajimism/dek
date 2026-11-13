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
