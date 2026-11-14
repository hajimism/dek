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
   * Set to 1, beside `DEK_PUB_DEV_LOGIN`, to let anyone sign up, for local runs; never in production,
   * where the operators invite people from /settings (ADR 85). Unset, only the people invited, the
   * operators and the people a deck is shared with by address may sign up.
   */
  DEK_PUB_OPEN_SIGN_UP: string().default("0"),
  /**
   * The people who run dek.pub, by email address, split by commas or whitespace: the account whose
   * verified address is listed may delete anyone's talk, for a takedown, and each such deletion is
   * logged. A listed address may always make an account, and invite others from /settings (ADR 82, 85).
   */
  DEK_PUB_OPERATORS: string().default(""),
  /** The talk the landing page shows as its sample, as `@handle/slug`; empty shows none. */
  FEATURED_TALK: string().default(""),
  AUTH_GITHUB_CLIENT_ID: string(),
  AUTH_GITHUB_CLIENT_SECRET: string(),
});
