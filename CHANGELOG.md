# Changelog

Release notes for `@hajimism/dek`. From 0.1.0 on, release-please writes this file from the Conventional Commits on `main`.

## 0.1.0 (2026-10-01)

The first release on npm.

### Features

* Published as `@hajimism/dek`. Create a project with `bunx @hajimism/dek init`, then install it with `bun add -d @hajimism/dek`.

### ⚠ BREAKING CHANGES

* The command is `dekc`, not `dek`. `dek` on npm is an unrelated package, and `bunx dek` ran it anywhere dek was not installed. Run `bunx dekc` inside a project; the package, `dek.toml`, `.dek/`, and the `DEK` lint codes keep their names.
