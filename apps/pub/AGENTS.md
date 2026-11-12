# apps/pub

The dek.pub server: a Void app (Svelte 5, on Cloudflare Workers) and, in `serve/`, the Worker that serves built decks. It is AGPL-3.0 (`LICENSE`), unlike the rest of the repository. Read the root `AGENTS.md` first; this file adds to it.

## Layout

- `pages/`: server-rendered pages, `.server.ts` beside each for its loader.
- `routes/api/`: the JSON API `dekc pub` and the pages call. Its shapes are `../../src/pub/protocol.ts`, shared with the CLI.
- `src/lib/`: domain logic in plain TypeScript, with no Void import. Test it in `tests/unit/`.
- `src/server/`: the thin layer that calls Void (D1, R2, auth). `src/server/void-auth.ts` is the only file that reaches into Void's internals.
- `src/ui/`: Svelte components and the design tokens.
- `db/schema.ts`: dek.pub's tables. After a change, run `bun run db:generate` and commit the SQL in `db/migrations/`.
- `serve/`: the serve Worker, a plain Worker deployed with wrangler.

## Rules

- **Nothing in `../../src/` imports from here.** The dependency goes one way.
- **The deck is never on the app's origin.** It is served from `d-<id>.dekusercontent.com` (in development `d-<id>.localhost:5173`) inside a sandboxed iframe; the page talks to it only through the embed API (`docs/reference/embed.md`).
- **A deck someone may not see is a 404, the same as one that does not exist.**
- **Never render a deck's text as HTML.** The script article prints paragraphs as text.
- **A change to the HTTP API changes `src/pub/protocol.ts` and both sides in one pull request.**

## Run it

```bash
bun run setup        # .env from dev.env, Void's types
bun run dev          # http://localhost:5173, decks on d-<id>.localhost:5173
bun run check        # svelte-check with TypeScript 6
bun run test         # unit tests in Node, components in Chromium
bun run test:serve   # the serve Worker, in workerd
bun run test:e2e     # the whole round trip, dekc against vp dev
```

Email sign-up works only where `.env` has `DEK_PUB_DEV_LOGIN=1`, as `dev.env` does. GitHub sign-in needs a real OAuth app's ID and secret in `.env`.
