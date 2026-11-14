// Signing in by a link mailed to an address, for the people a deck is shared with who have no
// GitHub account to sign in with. A link goes only to an address that has an account already, or
// that may make one: one dek.pub has invited, or one a share waits for. Asked for any other,
// dek.pub sends nothing and answers the same.

import { sendMail } from "../../../../common/mail.server.ts";
import { mayMakeAccount } from "./invitation.server.ts";
import { signInMail } from "./mail.ts";

export async function sendSignInLink(
  email: string,
  url: string,
  hasAccount: boolean,
): Promise<void> {
  // Following the link verifies the address, so it is asked of as verified.
  if (hasAccount || (await mayMakeAccount({ email, emailVerified: true, githubLogin: null }))) {
    await sendMail(signInMail(email, url));
  }
}
