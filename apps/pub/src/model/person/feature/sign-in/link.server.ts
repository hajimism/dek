// Signing in by a link mailed to an address, for the people a deck is shared with who have no
// GitHub account to sign in with. A link goes only to an address that has an account already or
// a share waiting for it; asked for any other, dek.pub sends nothing and answers the same.

import { sendMail } from "../../../../common/mail.server.ts";
import { hasWaitingGrant } from "../../../deck/grant/store.server.ts";
import { signInMail } from "./mail.ts";

export async function sendSignInLink(
  email: string,
  url: string,
  hasAccount: boolean,
): Promise<void> {
  if (hasAccount || (await hasWaitingGrant(email))) {
    await sendMail(signInMail(email, url));
  }
}
