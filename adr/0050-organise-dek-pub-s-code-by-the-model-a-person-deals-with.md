# 50. Organise dek.pub's code by the model a person deals with

Date: 2026-11-13

## Status

Accepted

Amends [43. Build dek.pub as a Void app and a serve Worker, checked on Miniflare](0043-build-dek-pub-as-a-void-app-and-a-serve-worker-checked-on-miniflare.md)

Amended by [76. Keep dek.pub's public comments in the deck model beside its likes, and call a feature a task a page or a route carries out](0076-keep-dek-pub-s-public-comments-in-the-deck-model-beside-its-likes-and-call-a-feature-a-task-a-page-or-a-route-carries-out.md)

## Context

ADR 43 laid `apps/pub` out by layer: domain logic in `src/lib/` with no Void import, the Void-facing code in `src/server/`, components in `src/ui/`. Two phases in, each thing a person deals with on dek.pub was spread across all three, and the rules that should hold everywhere were held by whoever remembered them:

- The access file the serve Worker reads was written again by four routes, each on its own.
- Which version a reader may see was decided in four places, by two different rules, and opening a comment followed neither, which let a reader learn about a version held back.
- A comment's logic sat in five places; whether a quote is hidden was decided in three of them.
- An account had six shapes, one of them sent to every page and one holding the email address.
- The talk page's loader gathered nine concerns in one function.

Void gives `.server.ts` a meaning only beside a page loader. Its client build turns `void/db` and `void/storage` into empty objects, so a component that reached the database would build and fail in the browser. The serve Worker imports two of the app's files by relative path, so they must stay free of Void.

## Decision

**The code is grouped by the model a person deals with: `src/model/person/`, `src/model/deck/` and `src/model/comment/`.** A deck holds `grant/`, `version/` and `serving/` inside it, since none of them exists without a deck. A model's folder holds its types in `type.ts`, its rules in plain files, its storage in `*.server.ts` files, and the components that show it in `ui/`. Routes, page loaders and middleware stay where Void wants them and only call into the models.

**A task that spans models, or reaches outside, is a feature: `src/model/<name>/feature/<task>/`.** They are `deck/feature/publish`, `deck/feature/talk` and `deck/feature/manage`, and `person/feature/connect-cli` and `person/feature/profile`. A feature may have its own `type.ts`, loader and components. A task one store function does, such as resolving a comment or promoting a version, stays in its model.

**What may import what:**

- Models come in the order person, deck, comment. Each may import the ones before it, and the ones after it only from a feature. The shell sits between person and deck: deck and comment may use it, the person model may not.
- A model's own files import no feature. Pages and routes import features; features import no other feature.
- `src/shell/` (the data the middleware hands each page, the header, the footer) knows `src/common/` and the person model. `src/common/` (HTTP helpers, IDs, words, generic components) knows no model.
- `deck/serving/` is what the app shares with the serve Worker: it imports only itself and the protocol, and the Worker imports only it.
- In `src/` and `pages/`, only a `*.server.ts` file imports `void`, `void/db`, `void/env`, `void/storage`, `void/auth` or another `*.server.ts`. Any other file takes row types from `@schema`, and a page its loader's props, with `import type` and nothing more. Routes, middleware and `auth.ts` run only on the server and are not held to this.
- Nothing a component imports as a value, however far down, imports zod.
- `tests/unit/boundaries.test.ts` checks every rule in this list and names each import that breaks one.

**A model's or feature's types are in its `type.ts`, and zod reads what comes from outside the code.** A type that only one file's functions take, such as a slide change or a quote, stays beside them; no test checks where a type is. On the server and in the serve Worker, zod reads Better Auth's user records into one `Person`, the JSON columns of versions and threads, the access file, the serve token and the theme cookie. Row types are Drizzle's own, through `import type`. Wire shapes stay in `src/pub/protocol.ts` and are imported, not written again. Code that runs in the browser does not use zod: it added 25 kB gzipped to the talk page, and `zod/mini` 7 kB. The embed messages and the device flow's answers are read by hand there, as before.

**Every change an owner makes to a deck goes through `updateDeck`.** It writes the access file again whenever a column the file is made from changes. Recording a version writes the file too, whatever changed, so a write that failed after D1 changed is put right then. Besides these, only the counters are written on the deck's row: the newest version's number, by the version store, and the next thread's, by the comment store.

**File names are kebab-case, Svelte components included.** Names Void reads stay as Void reads them: `pages/` with `index`, `layout`, `[param]` and `.server`, and the numbered middleware.

This replaces two places in ADR 43. Its Decision put domain logic in `src/lib/`, the Void-facing code in `src/server/`, and the private `__voidAuth` in `src/server/void-auth.ts`; they are now the models' plain files, the models' `*.server.ts` files, and `src/common/void-auth.server.ts`. Its Consequences said Void's API is called from `src/server/` and the page loaders only; it is now called from `*.server.ts` files and the page loaders only.

**What was not chosen:**

- **The layers of ADR 43.** They kept Void away from the pure code, which the test now does by file name, but put each model in three places.
- **A folder per page or route.** The talk page, the API and the CLI read the same deck and comments; by page, each rule would be written once per page.
- **An `index.ts` that gathers a model's exports.** One import of it from a component would pull a store into the browser.
- **zod schemas made from the tables (drizzle-zod).** A second source for what the schema already says, and one more dependency.
- **Biome's `noRestrictedImports` for the rules.** Its patterns name paths; they cannot say "the same feature" or "a model after this one".

## Consequences

- A file's path says what it holds: a model's types are in its `type.ts`, what is stored in its `*.server.ts`.
- The serve Worker's bundle includes zod.
- Writing the version rules once, in `deck/access.ts`, showed that opening a comment followed neither of them. Which versions were once current is not kept, so a reader now comments on the current version only, and one whose page is older is asked to reload it.
- A new model or feature has to take a place in the order; the boundaries test says when one does not.
- Imports of `src/pub/protocol.ts` from deep in a model have long relative paths.
- The comment model's insides are still taking shape, as the app's own list of open work says. Its folder and what it may import are settled, not how it works inside.
