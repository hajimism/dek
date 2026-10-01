# dek

A build system for talks, written in TypeScript on Bun. This file is for working on dek itself; `sample/AGENTS.md` is what dek writes for a talk project, not a guide to this repository.

## Layout

- `src/`: the CLI (`src/cli.ts`, `src/cli/`), the build and lint core (`src/core/`), the in-deck runtime, the theme, the dev server, video, and voice.
- `tests/`: `bun test`.
- `docs/`: the VitePress site, in English and in Japanese under `docs/ja/`.
- `sample/`: sample decks, built from this checkout.
- `adr/`: decision records.

## Rules

- **Agents are users.** Read the [Agent Usability Criteria](docs/guide/agent-criteria.md) before changing a command, a diagnostic, or a convention.
- **The command is `dekc`.** Write the product, the package, and its files as dek; write anything typed to run it as `dekc` ([ADR 2](adr/0002-keep-the-name-dek-and-run-it-as-dekc.md)).
- **Docs come in two languages.** A change to `docs/` or a README lands in both English and Japanese.
- **Commits are the release notes.** Conventional Commits, `!` for a breaking change; release-please turns them into versions and CHANGELOG.md ([ADR 3](adr/0003-release-through-release-please-and-npm-trusted-publishing.md)).
- If a command's `--json` shape changes, run `bun run schema` and commit the result.

## Decisions go in `adr/`

Every design decision that bears on a release gets an ADR in the same pull request: names, commands and flags, `--json` shapes, lint rules, config and frontmatter keys, runtimes and dependencies, the release pipeline, and anything breaking. [ADR 1](adr/0001-record-architecture-decisions.md) has the full list.

```bash
mise exec -- adrs new "Title of the decision"
mise exec -- adrs new --supersedes 3 "Title of the new decision"
mise exec -- adrs doctor
```

Fill every section. Never rewrite an accepted ADR to change the decision; supersede it. Before changing something an ADR covers, read it, and if the change goes against it, say so instead of working around it.

## Before you report work as done

Run what CI runs, listed in [CONTRIBUTING.md](CONTRIBUTING.md): `bunx biome ci .`, `bun run typecheck`, `bun run knip`, `bun test`, and `bun run docs:build` when docs or samples changed.
