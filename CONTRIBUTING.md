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

`bunfig.toml` keeps `bun install` and `bun add` from taking a version published in the last seven days, and Dependabot waits as long, so a hijacked release has time to be found first. To take a fix sooner, name it in `minimumReleaseAgeExcludes` for that one change.

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
- If you add or change a command, a lint rule, or a docs page's `description`, run `bun run llms` and commit `docs/public/llms.txt`.

## Tests with generated inputs

Some tests check a property over inputs [fast-check](https://fast-check.dev) generates: stylesheets, attribute values, TOML documents, and sequences of what the dev server is asked to do ([ADR 26](./adr/0026-check-scanners-and-server-state-over-generated-inputs-with-fast-check.md)). Each run of `bun test` starts them from a new seed. One that fails prints the input it shrank the failure to, what that input failed on, and the line that replays it:

```bash
FC_SEED=1234 FC_PATH=0:1:2 bun test tests/core/css-scan.test.ts -t 'closes every block where it was closed'
```

`FC_SEED` alone runs every property from that seed, and `FC_NUM_RUNS=10000` runs each that many times, to search harder than the suite does; either lifts the five-second limit a synchronous property otherwise stops at. Fix the defect, add the shrunk input as a test of its own beside the property, and run again.

## Commits and releases

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, and so on, with `!` for a breaking change. They are the release notes: release-please reads them to keep a release PR open, and merging that PR tags the version, writes [CHANGELOG.md](./CHANGELOG.md), and publishes to npm.

While dek is 0.x, a breaking change bumps the minor version and anything else bumps the patch.

## Decision records

A design decision that bears on a release, such as a name, a command or its `--json`, a lint rule, a config key, or anything breaking, gets an Architecture Decision Record in [`adr/`](./adr) in the same pull request. `mise install` brings in [adrs](https://github.com/joshrotenberg/adrs); write one with `mise exec -- adrs new "Title"` and check them with `mise exec -- adrs doctor`. [ADR 1](./adr/0001-record-architecture-decisions.md) says what counts.

## Conduct

Everyone taking part is expected to follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Security issues go through [SECURITY.md](./SECURITY.md), not public issues.
