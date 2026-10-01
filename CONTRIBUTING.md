# Contributing to dek

Thanks for helping. Bug reports, ideas, and pull requests are all welcome; for anything larger than a fix, open an issue first so we can agree on the shape before you write it.

## Setup

dek runs on [Bun](https://bun.sh) 1.4 or later (`mise install` picks the pinned version). CI also runs the latest Bun.

```bash
git clone https://github.com/hajimism/dek.git
cd dek
bun install
bunx playwright install chromium   # the visual checks, shots, and video tests
```

From the repository, run the CLI as `bun src/cli.ts`, or work in `sample/`, which installs this checkout: `cd sample && bunx dekc`.

## Before you open a pull request

CI runs each of these; run them locally first.

```bash
bunx biome ci .        # format and lint
bun run typecheck
bun run knip           # unused files, exports, dependencies
bun test
bun run docs:build     # docs and the sample decks
bash scripts/check-package.sh   # the tarball npm would ship, installed and run
```

- **Agents are users.** Read the [Agent Usability Criteria](https://hajimism.github.io/dek/guide/agent-criteria.html) before changing a command, a diagnostic, or a convention.
- **Docs come in two languages.** A change to `docs/` or a README lands in both English and Japanese.
- **The command is `dekc`.** Write the product, the package, and its files as dek; write anything you type to run it as `dekc`.
- If you change the shape of a command's `--json`, run `bun run schema` and commit the result.

## Commits and releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, and so on, with `!` for a breaking change. They are the release notes: release-please reads them to keep a release PR open, and merging that PR tags the version, writes [CHANGELOG.md](./CHANGELOG.md), and publishes to npm.

While dek is 0.x, a breaking change bumps the minor version and anything else bumps the patch.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Security issues go through [SECURITY.md](./SECURITY.md), not public issues.
