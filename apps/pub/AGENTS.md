# apps/pub

The dek.pub server: a Void app (Svelte 5, on Cloudflare Workers) and, in `serve/`, the Worker that serves built decks. It is AGPL-3.0 (`LICENSE`), unlike the rest of the repository. Read the root `AGENTS.md` first; this file adds to it.

## Layout

- `pages/`: server-rendered pages, `.server.ts` beside each for its loader.
- `routes/api/`: the JSON API `dekc pub` and the pages call. Its shapes are `../../src/pub/protocol.ts`, shared with the CLI.
- `src/model/<name>/`: one folder for each thing a person deals with on dek.pub: `person`, `deck` (with `grant/`, `version/` and `serving/` inside), `comment`. A model holds its types in `type.ts`, its rules in plain files, its storage in `*.server.ts` files, and the components that show it in `ui/`.
- `src/model/<name>/feature/<task>/`: a task that spans models or reaches outside, with its own `type.ts`, loader and components: `deck/feature/publish`, `talk` and `manage`; `person/feature/connect-cli` and `profile`.
- `src/shell/`: what every page shares: the data the middleware hands each page, the header and the footer.
- `src/common/`: what knows no model: the HTTP helpers, IDs, words in each language, and generic components with the design tokens. `src/common/void-auth.server.ts` is the only file that reaches into Void's internals.
- `tests/unit/`: one file for each model, plus `boundaries.test.ts`; `tests/browser/`: components and the browser-side classes.
- `db/schema.ts`: dek.pub's tables. After a change, run `bun run db:generate` and commit the SQL in `db/migrations/`.
- `serve/`: the serve Worker, a plain Worker deployed with wrangler.

## Rules

- **Nothing in `../../src/` imports from here.** The dependency goes one way.
- **The deck is never on the app's origin.** It is served from `d-<id>.dekusercontent.com` (in development `d-<id>.localhost:5173`) inside a sandboxed iframe; the page talks to it only through the embed API (`docs/reference/embed.md`).
- **A deck someone may not see is a 404, the same as one that does not exist.**
- **Never render a deck's text as HTML.** The script article prints paragraphs as text.
- **A change to the HTTP API changes `src/pub/protocol.ts` and both sides in one pull request.**
- **Only a `*.server.ts` file calls Void or imports another `*.server.ts`.** Models import in the order person, deck, comment; a model's own files import no feature, and a feature no other feature. `tests/unit/boundaries.test.ts` says what may import what, and fails on an import that breaks it (ADR 50).
- **Types go in the `type.ts` of their model or feature.** Read what comes from outside the code (Better Auth, a JSON column, R2, a cookie) through a zod schema there; take row types from `@schema` with `import type`, and wire shapes from the protocol. Code that runs in the browser does not import zod.
- **Every change to a deck goes through `updateDeck`** in `src/model/deck/store.server.ts`, which keeps the access file the serve Worker reads in step.
- **File names are kebab-case**, Svelte components included, except the names Void reads in `pages/` and `middleware/`.

## Run it

```bash
bun run setup        # .env from dev.env, Void's types
bun run dev          # http://localhost:5173, decks on d-<id>.localhost:5173; refuses to start if 5173 is taken
bun run check        # svelte-check with TypeScript 6
bun run test         # unit tests in Node, components in Chromium
bun run test:serve   # the serve Worker, in workerd
bun run test:e2e     # the whole round trip, dekc against vp dev
```

`.env` names port 5173 in `APP_ORIGIN` and `DECK_ORIGIN`, so the dev server never moves to another port: decks would load from whatever holds 5173. To run on another port, change both.

Email sign-up works only where `.env` has `DEK_PUB_DEV_LOGIN=1`, as `dev.env` does. GitHub sign-in needs a real OAuth app's ID and secret in `.env`.
