// What signing in and up do beyond Better Auth's own. On sign-in, the grants waiting on the address
// the account has verified become the account's, so the owner sees them by handle (ADR 73). On
// sign-up, the entries the account was let in by are claimed, so they let no one else in (ADR 85).

import { claimGrants } from "../../../deck/grant/store.server.ts";
import { readAccount } from "../../person.ts";
import { claimSignUpInvites } from "../../sign-up-invite.server.ts";
import { inviteEntriesOf } from "../../sign-up-invite.ts";

/** For Better Auth's `session.create.after`, with the user it read for the new session. */
export async function claimOnSignIn(user: unknown): Promise<void> {
  const person = user ? readAccount(user) : null;
  if (person) {
    await claimGrants(person);
  }
}

/** For Better Auth's `user.create.after`, with the account it has just made. */
export async function claimInvitesOnSignUp(user: unknown): Promise<void> {
  const account = readAccount(user);
  if (account) {
    await claimSignUpInvites(account.id, inviteEntriesOf(account));
  }
}
