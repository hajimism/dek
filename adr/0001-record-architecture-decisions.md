# 1. Record architecture decisions

Date: 2026-10-02

## Status

Accepted

## Context

dek is released to npm from `main`, and much of it is written with agents. A commit message says what changed, and CHANGELOG.md says what a user gets, but neither keeps why one option won over another. Without that, the next person, or the next agent, reopens a settled question or undoes a choice without knowing what it protected. The renames from dek to dekc and back, all on one day, are the example.

## Decision

Every design decision that bears on a release is recorded as an Architecture Decision Record in `adr/`, in the form Michael Nygard describes in [Documenting Architecture Decisions](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions), and kept with [adrs](https://github.com/joshrotenberg/adrs), pinned in `mise.toml`.

A decision bears on a release when it changes what ships or how it ships:

- the package, the command, or the names users type or write (`dekc`, `dek.toml`, `.dek/`, `DEK` codes);
- a command, its flags, or the shape of its `--json`;
- a lint rule's meaning or severity, or a convention the generated `AGENTS.md` teaches;
- the config files and the frontmatter of `script.md`: their keys, defaults, and which file wins;
- the supported runtimes and dependencies;
- the release, versioning, and publishing pipeline;
- anything a commit marks with `!` or `BREAKING CHANGE`.

A fix that brings behavior back in line with what is already decided needs no record.

The record lands in the same pull request as the change. Write it with `mise exec -- adrs new "<title>"`, fill every section, and run `mise exec -- adrs doctor`. An accepted record is not rewritten when the decision changes: a new one supersedes it with `adrs new --supersedes <n>`. Records are written in English, like commit messages, and only in English: `adr/` is outside `docs/` and is not part of the site.

## Consequences

Each record costs a few minutes per decision, and a pull request that changes what ships without one is incomplete. In exchange, why the code is the way it is can be read in one place, and a decision is changed by superseding it in the open rather than by drift.

Decisions made before this record (0002 to 0004) are written from their commit messages.
