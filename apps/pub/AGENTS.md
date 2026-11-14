# apps/pub

The dek.pub server: a Void app (Svelte 5, on Cloudflare Workers) and, in `serve/`, the Worker that serves built decks. It is AGPL-3.0 (`LICENSE`), unlike the rest of the repository. Read the root `AGENTS.md` first; this file adds to it.

## Layout

- `pages/`: server-rendered pages, `.server.ts` beside each for its loader.
- `routes/api/`: the JSON API `dekc pub` and the pages call. Its shapes are `../../src/pub/protocol.ts`, shared with the CLI.
- `src/model/<name>/`: one folder for each thing a person deals with on dek.pub: `person`, `deck` (with `grant/`, `version/`, `serving/`, `like/` and `public-comment/` inside), `comment` (review threads). A model holds its types in `type.ts`, its rules in plain files, its storage in `*.server.ts` files, and the components that show it in `ui/`.
- `src/model/<name>/feature/<task>/`: a task a page or a route carries out that takes more than one store function, with its own loader and components, and its `type.ts` when it has types of its own: `deck/feature/publish`, `talk`, `manage` and `sitemap`; `person/feature/choose-handle`, `connect-cli`, `profile`, `settings` and `sign-in` (ADR 76).
- `src/shell/`: what every page shares: the data the middleware hands each page, the header and the footer.
- `src/common/`: what knows no model: the HTTP helpers, IDs, words in each language, and generic components with the design tokens. `src/common/void-auth.server.ts` is the only file that reaches into Void's internals.
- `tests/unit/`: one file for each model and for `common` and `shell`, plus `boundaries.test.ts`; `tests/browser/`: components and the browser-side classes.
- `db/schema.ts`: dek.pub's tables. After a change, run `bun run db:generate` and commit the SQL in `db/migrations/`.
- `serve/`: the serve Worker, a plain Worker deployed with wrangler.
- `infra/`: `alchemy.run.ts`, the zones, zone settings and DNS records no deploy command writes, applied with Alchemy (ADR 70). It never declares what `void deploy` or `wrangler deploy` writes, and nothing else imports from it.

## Rules

- **Nothing in `../../src/` imports from here.** The dependency goes one way.
- **The deck is never on the app's origin.** It is served from `d-<id>.dekusercontent.com` (in development `d-<id>.localhost:5173`) inside a sandboxed iframe; the page talks to it only through the embed API (`docs/reference/embed.md`).
- **A deck someone may not see is a 404, the same as one that does not exist.**
- **Never render a deck's text as HTML.** The script article prints paragraphs as text.
- **A change to the HTTP API changes `src/pub/protocol.ts` and both sides in one pull request.**
- **In `src/` and `pages/`, only a `*.server.ts` file calls Void or imports another `*.server.ts`.** The order is common, person, shell, deck, comment: each imports only those before it, and a later model only from a feature. A model's own files import no feature, and a feature no other feature. `tests/unit/boundaries.test.ts` says what may import what, and fails on an import that breaks it (ADR 50).
- **A model's or feature's types go in its `type.ts`;** a type only one file's functions take may stay beside them. Read what comes from outside the code (Better Auth, a JSON column, R2, a cookie) through a zod schema there; take row types from `@schema` with `import type`, and wire shapes from the protocol. Nothing a component imports may import zod; the boundaries test follows the imports to check.
- **Every change an owner makes to a deck goes through `updateDeck`** in `src/model/deck/store.server.ts`, and every version through `recordVersion`; both write the access file the serve Worker reads (`syncAccess`). A deck is deleted only through `deleteDeck`, which takes the access file away first; a table that holds rows of a deck is listed in `DECK_ROWS` (`src/model/deck/deletion.ts`, ADR 82).
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

`DEK_PUB_INVITED` says who may make an account: addresses and `@<GitHub login>`s, split by commas or whitespace, or `*` for anyone; whoever a deck is shared with by address may too (ADR 79). `dev.env` sets `*`; a `.env` written before it has none, which lets only the people decks are shared with sign up, so add `DEK_PUB_INVITED=*` to it. The email form verifies no address, so it makes an account only under `*`. `tests/e2e/server.ts` sets the list to the addresses the run signs up.

`DEK_PUB_OPERATORS` names, by email address, the people who run dek.pub: the account whose verified address is listed may delete anyone's talk with `dekc pub takedown`, and each such deletion is logged. A listed address may make an account though `DEK_PUB_INVITED` leaves it out, and the email form, which verifies no address, never makes an operator (ADR 82). It is empty in `dev.env`; `tests/e2e/server.ts` names the run's operator by address.

Mail is kept, not sent, by the dev server: its inbox is at the URL `vp dev` prints on start, `/__void/inbox` with the token in `.void/dev-trigger-token`. `tests/e2e/server.ts` reads it the same way.
