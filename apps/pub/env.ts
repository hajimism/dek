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
  /** Turnstile's secret; `off` skips the check, on a machine that cannot reach Cloudflare. */
  TURNSTILE_SECRET: string(),
  /** The talk the landing page shows as its sample, as `@handle/slug`; empty shows none. */
  FEATURED_TALK: string().default(""),
  /** Turnstile's site key, for the widget; empty where the check is off. */
  TURNSTILE_SITE_KEY: string().default(""),
  AUTH_GITHUB_CLIENT_ID: string(),
  AUTH_GITHUB_CLIENT_SECRET: string(),
});
