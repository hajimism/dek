// A mail dek.pub sends: to one address, as plain text, in English for now. What each says is
// written by the model it is about; src/common/mail.server.ts sends it.

export type Mail = { to: string; subject: string; text: string };

/** A comment as a mail quotes it: on one line, cut to `max` characters. */
export function excerpt(text: string, max = 280): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}
