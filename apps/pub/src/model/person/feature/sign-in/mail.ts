// The mail that signs someone in by a link instead of GitHub.

import type { Mail } from "../../../../common/mail.ts";

/** How long a sign-in link works, in seconds; auth.ts gives Better Auth the same. */
export const SIGN_IN_LINK_SECONDS = 15 * 60;

export function signInMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Sign in to dek.pub",
    text: [
      "Open this link to sign in to dek.pub:",
      "",
      url,
      "",
      `It works once, for ${SIGN_IN_LINK_SECONDS / 60} minutes. If you did not ask to sign in, ignore this mail.`,
      "",
    ].join("\n"),
  };
}
