# 95. Make dek.pub's official account @dek by hand, with no sign-in, and publish the sample decks from it

Date: 2026-11-15

## Status

Accepted

## Context

The sample decks in `sample/` are served from the docs site, as HTML copied in at build time (ADR 41). dek.pub now runs in production (ADR 92, 94). It can host them as talks, with the viewer, the script beside the slides and a stable URL. They need an account to belong to, one that reads as dek's own.

The short names are reserved. `dek`, `dekc`, `dekpub`, `dek-pub` and `official` are in `RESERVED` in `apps/pub/src/model/person/handle.ts`, so that nobody can pose as dek.pub. That list is checked only where a person chooses their handle, on `/welcome` (ADR 77). Lookups by handle do not check it.

Signing up the usual way needs an invitation (ADR 79, 85), a sign-in by GitHub or by mailed link, and then the choice of a handle. Mail reaches only addresses verified in Email Routing until Email Sending is set up, as the launch checklist in `apps/pub/` notes. The handle chosen that way could not be a reserved one. The account also has no person behind it who signs in to a browser: it exists to own the sample decks and to be published to from the command line.

What makes an account signed up is a `user` row with a handle: `currentPerson` refuses only an account whose handle is null. A CLI key is an `apikey` row whose `key` is the unpadded base64url SHA-256 of the whole key, `dekpub_` followed by 64 letters. That is the format the device flow mints with `createApiKey`. Nothing in the request paths reads the `account` table, so an account with no sign-in method works for everything except `/settings`, which needs a browser session.

## Decision

**dek.pub's official account is @dek, made by hand in the production D1.** It is one `user` row with `name` `dek`, `handle` `dek`, and an address its owner controls, with `emailVerified` 1. It has no `account` row, so it has no sign-in method and no browser session. It was written on 2026-11-15 with `void db execute --remote`.

**It publishes with one CLI key, also made by hand.** The key was generated locally in the format above, and only its hash went into `apikey`, with `name` `dek official` and the year's expiry the device flow gives (ADR 83). The key itself is kept outside the repository and is used as `DEK_TOKEN`. When it expires, or leaks, a new row replaces it. `dekc pub logout --all` with the key revokes it.

**The reserved list stays as it is.** @dek is the one exception, made outside the app, so a person choosing a handle still cannot take `dek` or any other reserved name. The account is not an operator: its address is not in `DEK_PUB_OPERATORS`, so it cannot take talks down.

**The sample decks are published from it, and their `pub:` lines are committed.** `why-dek`, `lightning` and `with-agents` are at `https://dek.pub/@dek/<deck>`, public, and each `script.md` holds its `pub:` ID, as ADR 46 has it. The round trip in `apps/pub/tests/e2e/run.ts` copies `sample/` onto an empty database, so it takes the `pub:` lines out of its copy before it publishes. `dekc ref` puts a deck under `refs/`, not `decks/`, so a project that refs a sample deck never publishes onto @dek's ID.

## Consequences

- The sample decks have a home on dek.pub that the docs can link to, in place of the copies under `/dek/samples/` (ADR 41). Moving the links is a decision of its own.
- @dek cannot open `/settings`. To list or rename its keys, someone writes SQL again. To sign it in, the address on the row can be sent a sign-in link once mail reaches it.
- A deleted or rotated key is a hand edit to production. Making the account again would be one too. dek.pub already deletes accounts by hand, row by row.
- Each publish replaces the version before it, and nothing republishes the sample yet. The talks on dek.pub fall behind `sample/` until someone republishes them with the key, by hand or from a workflow that holds it as a secret.
- `FEATURED_TALK` can now name `@dek/why-dek`. Setting it is a change to production's settings, not made here.
