// Who may make an account on dek.pub. It opens by invitation: an operator lists the addresses and
// GitHub logins it lets in, from /settings (ADR 85), and a person a deck is shared with by address
// gets in too, so a reviewer needs no invitation of their own (ADR 79), and so does an operator, by
// the address `DEK_PUB_OPERATORS` lists (ADR 82). Signing in to an account that exists is never
// held to it.

import { inviteEntriesOf } from "./sign-up-invite.ts";
import { type JoinRule, Newcomer } from "./type.ts";

/**
 * Whether sign-up is open to anyone, as it is for local runs: `DEK_PUB_OPEN_SIGN_UP` is 1, and so
 * is `DEK_PUB_DEV_LOGIN`, which production never sets. Either alone opens nothing.
 */
export function signUpIsOpen(env: {
  DEK_PUB_OPEN_SIGN_UP: string;
  DEK_PUB_DEV_LOGIN: string;
}): boolean {
  return env.DEK_PUB_OPEN_SIGN_UP === "1" && env.DEK_PUB_DEV_LOGIN === "1";
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
 * Whether an account may be made for `newcomer`: anyone may where sign-up is open; otherwise a
 * verified address among the operators, an entry no account has claimed that names the verified
 * address or the GitHub login, or a verified address a share waits for, which is asked last. An
 * address that is not verified never counts, so the first operator can make an account on an
 * empty database from the settings alone.
 */
export async function mayJoin(newcomer: Newcomer, rule: JoinRule): Promise<boolean> {
  if (rule.open) {
    return true;
  }
  const email = newcomer.email.toLowerCase();
  if (newcomer.emailVerified && rule.operators.has(email)) {
    return true;
  }
  const entries = inviteEntriesOf(newcomer);
  if (entries.length > 0 && (await rule.invited(entries))) {
    return true;
  }
  return newcomer.emailVerified && rule.grantWaits(email);
}
