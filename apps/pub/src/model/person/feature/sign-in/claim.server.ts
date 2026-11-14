// What signing in does beyond Better Auth's own: the grants waiting on the address the account has
// verified become the account's, so the owner sees them by handle (ADR 73).

import { claimGrants } from "../../../deck/grant/store.server.ts";
import { readAccount } from "../../person.ts";

/** For Better Auth's `session.create.after`, with the user it read for the new session. */
export async function claimOnSignIn(user: unknown): Promise<void> {
  const person = user ? readAccount(user) : null;
  if (person) {
    await claimGrants(person);
  }
}
