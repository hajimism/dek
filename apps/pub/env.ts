import { defineEnv, string, url } from "void/env";

export default defineEnv({
  /** Signs the short-lived tokens the serve Worker checks before it hands out a deck. */
  SERVE_TOKEN_SECRET: string(),
  /** Where decks are served from; `{id}` is the deck's ID without its `d_`. */
  DECK_ORIGIN: string().default("https://d-{id}.dekusercontent.com"),
  /** The app's own origin, as links in feeds and the CLI's URLs use it. */
  APP_ORIGIN: url().default("https://dek.pub"),
  /** Set to 1 on a machine where email sign-up stands in for GitHub; never in production. */
  DEK_PUB_DEV_LOGIN: string().default("0"),
  /**
   * Who may sign up, as addresses and `@<GitHub login>`s split by commas or whitespace, or `*` for
   * anyone; besides them, only the people a deck is shared with by address. Never `*` in production
   * until dek.pub is ready for anyone (ADR 79).
   */
  DEK_PUB_INVITED: string().default(""),
  /**
   * The people who run dek.pub, by email address, split by commas or whitespace: the account whose
   * verified address is listed may delete anyone's talk, for a takedown, and each such deletion is
   * logged. A listed address may make an account though `DEK_PUB_INVITED` leaves it out (ADR 82).
   */
  DEK_PUB_OPERATORS: string().default(""),
  /** The talk the landing page shows as its sample, as `@handle/slug`; empty shows none. */
  FEATURED_TALK: string().default(""),
  AUTH_GITHUB_CLIENT_ID: string(),
  AUTH_GITHUB_CLIENT_SECRET: string(),
});
