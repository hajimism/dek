// A mail dek.pub sends: to one address, as plain text, in English for now. What each says is
// written by the model it is about; src/common/mail.server.ts sends it.

export type Mail = { to: string; subject: string; text: string };
