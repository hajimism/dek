// The mail an address is sent when an operator invites it to sign up (ADR 85). It says the same
// whoever sent it: the fixed text, the address it went to, and the sign-in page, and nothing an
// operator could write. Whoever gets it has no account, so no language of their own on dek.pub
// either; it is written in English, then in Japanese.

import type { Mail } from "../../../../common/mail.ts";

export function inviteMail(to: string, signInUrl: string): Mail {
  return {
    to,
    subject: "You’re invited to dek.pub / dek.pub への招待",
    text: [
      "You’re invited to make an account on dek.pub, where talks made with dek are published, shared and reviewed.",
      "",
      `To make it, open the page below and sign in with this address, ${to}. dek.pub mails you a link, and no password is needed.`,
      "",
      signInUrl,
      "",
      "If you did not expect this mail, ignore it.",
      "",
      "---",
      "",
      "dek.pub に招待されました。dek で作ったトークを公開し、共有し、レビューを受けられる場所です。",
      "",
      `アカウントを作るには、下のページを開き、このアドレス（${to}）でサインインしてください。dek.pub がリンクをメールで送ります。パスワードはいりません。`,
      "",
      signInUrl,
      "",
      "心当たりがなければ、このメールは無視してください。",
      "",
    ].join("\n"),
  };
}
