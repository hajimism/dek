# 43. Build dek.pub as a Void app and a serve Worker, checked on Miniflare

Date: 2026-11-12

## Status

Accepted

## Context

dek.pub needs server-rendered pages (the script article must reach search engines and link previews), a JSON API for the CLI, sign-in through GitHub with a device flow for the CLI, a relational store for decks, versions and comments, object storage for the built files, and, from phase 3, a room per presentation for live sync. The deck itself is its author's JavaScript, so it must be served from an origin that holds nothing: no cookie, no database, no other deck.

Void (VoidZero's full-stack Vite framework, GA 2026-10-15) runs on Cloudflare Workers and wires D1, R2, Queues, Durable Objects and Better Auth from one project, with `pages/` for SSR pages and `routes/` for Hono handlers. It is built on Vite+, and it has a Svelte integration. Its local runtime is workerd through Miniflare, so D1, R2 and auth run on the machine without an account. It is young: four minor versions in four weeks.

`bunfig.toml` refuses versions published in the last seven days (ADR 19). On 2026-11-12 that leaves Void 1.6.2, `@void/svelte` 1.6.2, Vite+ 1.5.0 and Better Auth 1.7.17.

## Decision

**The app (`apps/pub`) is a Void project in pages mode with Svelte 5.** Pages are `pages/` with `.server.ts` loaders and `defineHead` for link previews; the API is `routes/api/`; D1 tables are `db/schema.ts` with the SQL Void generates committed in `db/migrations/`; R2 is `void/storage`. `void` and `@void/svelte` are pinned exactly, as `@void/svelte` pins `void`. Domain logic is plain TypeScript in `src/lib/`, with no Void import, and the Void-facing code in `src/server/` is thin. The one private Void name used, `__voidAuth` (the request's Better Auth instance), is read in a single file, `src/server/void-auth.ts`.

**Sign-in is Better Auth as Void configures it, extended in `auth.ts`:** GitHub, the device-authorization plugin for `dekc pub login` (client ID `dekc` only), the bearer plugin so the device flow's session token can be traded at `POST /api/cli/key`, and the api-key plugin for the key the CLI keeps. A key is checked by dek.pub's own API through `verifyApiKey`; it is not turned into a session for every endpoint (`enableSessionForAPIKeys` stays off), and the plugin's per-key rate limit is off. Email sign-up is on only where `DEK_PUB_DEV_LOGIN` is `1`.

**The serve Worker (`apps/pub/serve`) is a plain Worker, outside Void, deployed with wrangler.** It answers `d-<id>.dekusercontent.com/v/<n>/` with one build from R2 under a content security policy that stops every request out of the page. It reads no database: the app writes `decks/<id>/access.json` beside each deck in R2, which says what may be served without a token (a public deck's current version), and anything else needs an HMAC token the app signs for one deck, version and build, good for ten minutes.

**Local development runs on Miniflare, with no account.** `vp dev` serves the app on `localhost:5173`; a development-only middleware (`middleware/00.deck-host.dev.ts`) answers `d-<id>.localhost:5173` with the serve Worker's handler and the same local R2, so a deck still gets an origin of its own that the app's cookies do not reach. `bun run setup` writes `.env` from `dev.env`. Turnstile's secret `off` skips the human check where Cloudflare is unreachable.

**Type checking and tests:**

- `svelte-check` checks `.svelte` and `.ts` in `apps/pub` with TypeScript 6, which it requires; the root stays on TypeScript 7.
- `vp test` runs the app's unit tests in Node and its component tests in Chromium through Vitest Browser Mode.
- The serve Worker's tests run in workerd through `@cloudflare/vitest-plugin`.
- An end-to-end test starts `vp dev` and drives the whole round trip with the real CLI.
- Lint and format stay Biome's, as in the rest of the repository; `.svelte` files are linted with the rules Biome documents as unsafe for them turned off, and not formatted.

**What was not chosen:**

- **SvelteKit with adapter-cloudflare.** It is mature, and its remote functions are good; the app would wire D1, R2, auth and, later, Durable Objects itself. It stays the fallback if Void's auth or rooms fall short.
- **One Worker that also serves decks under a path.** The deck's script would run on the app's origin, next to the session cookie.
- **Serving decks with a token always.** A public deck's page could not be cached at the edge, and an embedded deck would stop when its token expired.
- **wrangler dev for the serve Worker beside `vp dev`.** Two processes would have to share Miniflare's R2 directory, whose layout neither tool documents.

## Consequences

- The app depends on a framework in its first month. Its API is called from `src/server/` and the page loaders only, and the version moves only by a Dependabot pull request that CI checks.
- The app's Worker will hold Durable Objects (phase 3), so it has no preview URL per pull request; a staging configuration takes that place.
- Node 24.22 is a development dependency, pinned in `mise.toml`, since Void and Vite+ run on Node. dek itself still needs only Bun.
- Production needs real values for `SERVE_TOKEN_SECRET`, `AUTH_GITHUB_CLIENT_ID`, `AUTH_GITHUB_CLIENT_SECRET` and `TURNSTILE_SECRET`, set with `void secret put`, and `DEK_PUB_DEV_LOGIN` unset.
