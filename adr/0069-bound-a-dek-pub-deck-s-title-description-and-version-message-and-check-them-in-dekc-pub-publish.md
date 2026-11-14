# 69. Bound a dek.pub deck's title, description and version message, and check them in dekc pub publish

Date: 2026-11-14

## Status

Accepted

## Context

`src/pub/protocol.ts` bounds most of what a client sends dek.pub: comment text at 4000 characters, a slide's title and the event at 500, a quote at 500. A version's `title`, `description` and `message`, and the title `POST /api/decks` takes, had no bound. Only the 50 MiB cap on a whole version held them, so a title of several megabytes would reach a D1 row, every page and feed that prints it, and each mail that names the deck.

`dekc pub publish` reads the title and the description from `script.md`'s frontmatter and the message from `--message`, and sent them without a check. A server refusal comes back after the build and the pictures, which take most of a publish.

## Decision

**The protocol bounds them:** `VersionManifest.title` at 500 characters, `description` and `message` at 2000, and `CreateDeckRequest.title` at 500. The title's bound matches a slide's title and the event; the description's leaves room for a paragraph, more than a link preview shows. The server refuses more with 422 `invalid_manifest` or `invalid`, naming the field, as it does for any field out of shape.

**`dekc pub publish` checks the three before it builds or sends anything,** reading each bound from the manifest's schema so the CLI and the server cannot drift. A field over its bound stops it with exit 1 and an error that says the field's length and the bound; for the title and the description it names `script.md` as the path, and the hint says what to shorten: `title:` or `description:` in the frontmatter, or `--message`.

**`PROTOCOL_VERSION` stays 2.** No dek.pub has run with the old shapes, so no client relies on sending more.

**What was not chosen:**

- **A lint rule for long titles.** The bound is dek.pub's, not a slide's; a deck built only for `dekc build` may have any title.
- **Cutting a long field short on the server.** The author would see a title they did not write.
- **Bounding every string in the manifest.** The slide map's text is the script, bounded by the version's size; these three are the fields printed alone on pages, feeds and mail.

## Consequences

- `tests/unit/deck.test.ts` checks the bounds as the server reads a manifest; `tests/cli/pub-publish.test.ts` checks that `dekc pub publish` stops before any request, with the field and the fix.
- The CLI reference says, in both languages, which fields are bounded and at what length.
- Raising a bound later is safe for older clients; lowering one would need a new protocol version.
