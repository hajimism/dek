// A mail dek.pub sends: to one address, as plain text, in English for now, but for an invitation to
// sign up, whose reader has no account to take a language from, which is in English and Japanese
// (ADR 85). What each says is written by the model it is about; src/common/mail.server.ts sends it.

export type Mail = { to: string; subject: string; text: string };
