// The mail that tells someone a deck was shared with them. It names the talk and what the grant
// lets them do, never the side they are on.

import type { Mail } from "../../../common/mail.ts";
import type { GrantRole } from "./type.ts";

export function invitationMail(invite: {
  to: string;
  inviter: string;
  title: string;
  role: GrantRole;
  url: string;
  /** Shared by address, with no account behind it yet. */
  byEmail: boolean;
}): Mail {
  const may = invite.role === "comment" ? "to read and comment on." : "to read.";
  return {
    to: invite.to,
    subject: `${invite.inviter} shared “${invite.title}” with you`,
    text: [
      `${invite.inviter} shared “${invite.title}” with you on dek.pub, ${may}`,
      "",
      invite.url,
      "",
      ...(invite.byEmail
        ? [
            `To open it, sign in with ${invite.to}; dek.pub mails you a link, and no password is needed.`,
            "",
          ]
        : []),
    ].join("\n"),
  };
}
