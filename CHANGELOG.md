# Changelog

Release notes for `@hajimism/dek`. From 0.1.0 on, release-please writes this file from the Conventional Commits on `main`.

## [0.2.0](https://github.com/hajimism/dek/compare/v0.1.0...v0.2.0) (2026-10-01)


### ⚠ BREAKING CHANGES

* max_classes, cjk_per_minute and latin_per_minute in dek.toml no longer apply to existing decks. Add them to each deck's script.md frontmatter to keep them; lint's DEK008 names each one.

### Features

* let a deck own its class budget and speaking rate ([8dc9a07](https://github.com/hajimism/dek/commit/8dc9a07efb32b803e685a353ee628cae21a8bc56))


### Bug Fixes

* **lint:** count vbscript: and script-running data: URLs in DEK011 ([1b825b1](https://github.com/hajimism/dek/commit/1b825b1bffc33809ef0bdf3a8e5a1d45794a41a7))

## 0.1.0 (2026-10-01)

The first release on npm.

### Features

* Published as `@hajimism/dek`. Create a project with `bunx @hajimism/dek init`, then install it with `bun add -d @hajimism/dek`.

### ⚠ BREAKING CHANGES

* The command is `dekc`, not `dek`. `dek` on npm is an unrelated package, and `bunx dek` ran it anywhere dek was not installed. Run `bunx dekc` inside a project; the package, `dek.toml`, `.dek/`, and the `DEK` lint codes keep their names.
