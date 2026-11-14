// Who may make an account on dek.pub. It opens by invitation: `DEK_PUB_INVITED` lists the
// addresses and GitHub logins it lets in, or is `*` for anyone, and a person a deck is shared
// with by address gets in too, so a reviewer needs no invitation of their own (ADR 79). Signing
// in to an account that exists is never held to it.

import { type Invited, Newcomer } from "./type.ts";

/**
 * The list `DEK_PUB_INVITED` holds: entries split by commas or whitespace, each an address or
 * `@<GitHub login>`; `*`, as the whole list, lets anyone in. Any other entry counts for nothing.
 */
export function readInvited(setting: string): Invited {
  const entries = setting
    .split(/[\s,]+/)
    .map((entry) => entry.toLowerCase())
    .filter(Boolean);
  const logins = entries.filter((entry) => /^@[^@]+$/.test(entry)).map((entry) => entry.slice(1));
  const emails = entries.filter((entry) => /^[^@*]+@[^@*]+$/.test(entry));
  return {
    anyone: entries.length === 1 && entries[0] === "*",
    emails: new Set(emails),
    logins: new Set(logins),
  };
}

/** What Better Auth's `validateUserInfo` is handed, read; null, with the reason logged, for anything else. */
export function readNewcomer(data: unknown): Newcomer | null {
  const read = Newcomer.safeParse(data);
  if (!read.success) {
    console.error("dek.pub cannot read who is signing up:", read.error.message);
    return null;
  }
  return read.data;
}

/**
 * Whether an account may be made for `newcomer`: anyone may when the list is `*`; otherwise a
 * GitHub login on it, a verified address on it, or a verified address a share waits for, which
 * `grantWaits` is asked of last. An address that is not verified never counts.
 */
export async function mayJoin(
  invited: Invited,
  newcomer: Newcomer,
  grantWaits: (email: string) => Promise<boolean>,
): Promise<boolean> {
  if (invited.anyone) {
    return true;
  }
  if (newcomer.githubLogin && invited.logins.has(newcomer.githubLogin.toLowerCase())) {
    return true;
  }
  if (!newcomer.emailVerified) {
    return false;
  }
  const email = newcomer.email.toLowerCase();
  return invited.emails.has(email) || grantWaits(email);
}
