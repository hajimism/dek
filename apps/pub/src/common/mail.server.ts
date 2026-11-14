// Sending mail, through Void's sendEmail: Cloudflare Email Sending once deployed, the dev server's
// inbox locally. A mail that cannot be sent is logged and dropped; what it was about has happened
// either way, so it never fails the request that sent it. The provider's refusal is logged by its
// code: its message may name the recipient.

import { sendEmail } from "void/email";
import { log } from "./log.ts";
import type { Mail } from "./mail.ts";

/** Send one mail from void.config.ts's sender; true once the provider has taken it. */
export async function sendMail(mail: Mail): Promise<boolean> {
  try {
    const result = await sendEmail(mail);
    if (result.ok) {
      return true;
    }
    const errors =
      "error" in result
        ? [result.error]
        : result.deliveries.flatMap((delivery) => (delivery.ok ? [] : [delivery.error]));
    for (const error of errors) {
      console.error(`a mail was not sent: ${error.code}`);
    }
  } catch (error) {
    log("error", "a mail was not sent", error);
  }
  return false;
}
