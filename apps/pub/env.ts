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
  /** Turnstile's secret; Cloudflare's always-pass test secret in development. */
  TURNSTILE_SECRET: string().default("1x0000000000000000000000000000000AA"),
  AUTH_GITHUB_CLIENT_ID: string(),
  AUTH_GITHUB_CLIENT_SECRET: string(),
});
