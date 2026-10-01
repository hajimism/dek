# 2. Keep the name dek and run it as dekc

Date: 2026-10-01

## Status

Accepted

## Context

`dek` on npm is an unrelated package. With the bin named `dek`, `bunx dek` anywhere dek was not installed downloaded and ran someone else's code.

Two fixes were tried first. Renaming everything to an unscoped `dekc` (aa6d85c) failed because npm refuses `dekc` as too close to del, defu, and depd. Publishing as `@hajimism/dekc` (3ac638b) worked, but left the product, the repository, the docs, and every identifier renamed for a problem only the command had.

## Decision

The product, the package `@hajimism/dek`, the repository, the docs at `/dek/`, `dek.toml`, `.dek/`, the `DEK` lint codes, and every identifier keep the name dek. Only the bin is `dekc` (385f900).

Write the product, the package, and its files as dek; write anything a user types to run it as `dekc`. Installs go through `bunx @hajimism/dek init` and `bun add -d @hajimism/dek`.

## Consequences

npm keeps anyone else off the unscoped `dekc` by the same rule that refused it to us, so `bunx dekc` reaches this tool or nothing, never someone else's code.

The name a user types differs from the name they read, so every usage line, hint, help text, doc example, and sample script must say `dekc`, and CONTRIBUTING.md and AGENTS.md say so.
