# 112. Tighten dek.pub protocol negotiation and return invited from POST grants

Date: 2026-11-26

## Status

Accepted

Amends [75. Manage a dek.pub deck's grants with dekc pub grants, add and remove](0075-manage-a-dek-pub-deck-s-grants-with-dekc-pub-grants-add-and-remove.md)

Amends [47. Put a talk on dek.pub with the dekc pub commands](0047-put-a-talk-on-dek-pub-with-the-dekc-pub-commands.md)

Amends [61. Let only signed-in accounts write dek.pub public comments, and drop guests and Turnstile](0061-let-only-signed-in-accounts-write-dek-pub-public-comments-and-drop-guests-and-turnstile.md)

## Context

`src/pub/protocol.ts` and `src/pub/paths.ts` hold the shared wire contract between `dekc pub` and `apps/pub`, but several edges drifted:

- **One-sided protocol negotiation:** `refusal()` (`apps/pub/src/common/http.ts`) only rejected `dek-protocol` headers above `PROTOCOL_VERSION`. Non-integers (`"soon"`, `""`, `"1.5"`), `0`, negative numbers, and protocol `1` passed through silently, so older CLIs received `422 invalid_manifest` errors instead of a clean protocol refusal, and responses carried no `dek-protocol` header. `readManifest()` also ran `VersionManifest.safeParse` before checking `protocol`.
- **Racy double-round-trip in `dekc pub grants add`:** [ADR 75](0075-manage-a-dek-pub-deck-s-grants-with-dekc-pub-grants-add-and-remove.md) had the CLI call `GET /grants` before `POST /grants` solely to infer `invited`, even though `POST /api/decks/:id/grants` already computes `invite` and discarded whether it was newly created.
- **`answerOf()` skipped `z.ZodRecord`:** Forward-compatible response loosening did not recurse into `z.record()` or `z.partialRecord()`, so any record of objects in a future response would reject added fields on older CLIs.
- **Unshared wire shapes, error codes, and path helpers:** `RevokedKey` (`{ revoked: boolean }`), `"stale_base"`, `"slug_taken"`, `fileName()`, and `talkPath` / `TALK_PATH` were duplicated across `src/` and `apps/pub/`.
- **Publish docs overstated `full.html` serving:** `docs/guide/publish.md` and `docs/reference/cli.md` (EN and JA) implied dek.pub serves `full.html` to owners, whereas dek.pub currently serves `public.html` or `bare.html` depending on `scriptPublic` (`full.html` is uploaded for future use).

## Decision

**Enforce both protocol version bounds and echo `dek-protocol` on API responses:**

- Export `PROTOCOL_MIN_VERSION = 2` alongside `PROTOCOL_VERSION = 2` in `src/pub/protocol.ts`.
- `refusal()` still allows requests with no `dek-protocol` header (browser pages and Better Auth), and refuses any present header that is not a positive base-10 integer, is above `PROTOCOL_VERSION`, or is below `PROTOCOL_MIN_VERSION`, with `400 protocol` and an actionable hint.
- `api()` in `apps/pub/src/common/http.server.ts` attaches the `dek-protocol` header (`PROTOCOL_VERSION`) to every API response (success and error).
- `readManifest()` checks `protocol` bounds on the parsed JSON object before `VersionManifest.safeParse()` so older or newer upload manifests return `400 protocol` instead of `422 invalid_manifest`.

**Return `invited` directly from `POST /api/decks/:id/grants`:**

- Add `GrantAdded` in `src/pub/protocol.ts`, extending `Grant` with `invited: boolean`.
- `POST /api/decks/:id/grants` returns the grant with `invited: invite !== null` and status `201`.
- `dekc pub grants add` sends a single `POST` request and reads `GrantAdded`, removing the racy pre-flight `GET /grants`.

**Complete the shared protocol surface:**

- Teach `answerOf()` in `src/pub/protocol.ts` to recurse into `z.ZodRecord` (preserving `partialRecord` and any record checks).
- Share `RevokedKey`, `STALE_BASE`, `SLUG_TAKEN`, and `fileName()` from `src/pub/protocol.ts`, and `profilePath()`, `talkPath()`, and `TALK_PATH` from `src/pub/paths.ts` (zero zod, keeping browser bundles free of zod per [ADR 90](0090-have-dek-pub-s-pages-call-the-api-through-the-protocol-s-paths-without-zod-and-read-each-answer-one-way.md)).
- Update `docs/guide/publish.md` and `docs/reference/cli.md` (EN and JA) so they accurately state that `full.html` is uploaded while dek.pub currently serves `public.html` or `bare.html`.

**What was not chosen:**

- **Dropping `full.html` or `source.tar` from `dekc pub publish` now.** Removing `builds.full` or `local.source` from `dekc pub publish` / `status` `--json` would narrow `cli.schema.json` and require a breaking release ([ADR 31](0031-fail-a-pull-request-that-narrows-json-without-a-commit-marked-breaking.md)), and `dekc pub status` relies on `files.source` to detect local changes. Updating the docs to match current serving behavior avoids unnecessary churn.
- **Requiring `dek-protocol` on browser requests.** Svelte pages ship with the server itself and share its origin and release; keeping the header optional preserves browser calls and Better Auth endpoints.
- **Bumping `PROTOCOL_VERSION` to 3 for `GrantAdded`.** Older CLIs parse `POST /grants` via `answerOf(Grant)` which ignores unknown fields (`invited`), so adding `invited` is backward-compatible with older CLIs; `PROTOCOL_VERSION` stays at `2`.

## Consequences

- Older or malformed CLI protocol headers fail fast with `400 protocol` and a clear hint instead of failing deep inside schema validation.
- `dekc pub grants add` completes in one atomic round-trip with no race between `GET` and `POST`, and its `--json` output shape is unchanged.
- `answerOf()` handles future record-of-object response fields without breaking older CLIs.
- Shared wire shapes, error codes, filenames, and talk path helpers live in one place (`src/pub/protocol.ts` and `src/pub/paths.ts`).
