# 91. Run only the CI checks a pull request's files need, and every check on main

Date: 2026-11-15

## Status

Accepted

## Context

CI runs every check on every pull request. The `check` job (on Bun 1.4.0 and on the latest Bun) installs Chromium, CJK fonts and rumdl, runs all of `bun test`, about 3,200 tests that take some three minutes, and builds the docs; `package` packs and installs the tarball; `pub` runs dek.pub's checks and its end-to-end round trip. A pull request that changes only `apps/pub/` waits for dek's whole suite, and one that changes only `docs/` for dek.pub's round trip, though neither can be broken by it.

The code is laid out so that what a change can reach follows from where it is. Nothing in `src/` imports from `apps/pub/` (`apps/pub/AGENTS.md`), and the root's `tsconfig.json` and tests read only `src/`, `tests/` and `evals/`. The other way, dek.pub's round trip builds a deck from `sample/` with this checkout's `dekc` and publishes it, so a change anywhere in `src/` can break it.

`check (bun 1.4.0)`, `check (bun latest)` and `package` are required checks on `main`. A matrix job skipped by a job-level `if` reports under its unexpanded name, `check (bun ${{ matrix.bun }})`, so the required check would never report and the pull request could not merge.

## Decision

**A pull request runs the checks its files need.** `scripts/ci-scope.ts` reads the files the pull request's merge commit changes from its base and answers two flags:

- `pub` alone for a change under `apps/`;
- `root` alone for `docs/`, `adr/`, `tests/`, `skills/`, and the repository's README, CONTRIBUTING, CHANGELOG, AGENTS and CLAUDE files;
- both for `src/` and `sample/`, which dek.pub's round trip builds and publishes;
- both for any other file, such as `package.json`, `bun.lock`, `mise.toml`, the configs and the workflows, and for anything it does not know.

A pull request's flags are those of all its files together.

**A push to `main` runs every check,** so whatever a pull request's checks left out is checked once it lands.

**Each job reads the flags itself and skips steps, not itself.** Every job checks out with `fetch-depth: 2`, for the merge commit and its base, and runs the script as a step before the rest; the steps the change does not need are skipped. So each required check reports, with its expanded name. A job never depends on another job's answer, so a failure to read the change fails the job instead of skipping it. `check` always runs `biome ci`, `typecheck` and `knip`, which cover `apps/pub/` as well and take seconds. The `adr` job always runs.

**Rejected:**

- **`paths` and `paths-ignore` on the workflow.** A workflow that does not run leaves its required checks unreported, and the pull request cannot merge.
- **A job that reads the change, and `needs:` from the others.** A required job skipped because that job failed reports as passing.
- **An action that reads the paths, such as `dorny/paths-filter`.** One more dependency with access to the token, for what `git diff` does.
- **Choosing single test files by their imports in CI.** `scripts/related-tests.ts` does that for the agent's Stop hook; in CI it would miss what no import shows, such as a schema, a migration, a config or code in a string. The split here is by workspace, which those do not cross.

## Consequences

- A pull request inside `apps/pub/` skips Chromium, the fonts, rumdl, `bun test`, the docs build and the package check; one inside `docs/` or `adr/` skips dek.pub's round trip.
- A change that crosses from one side to the other without a file on both, through something `scripts/ci-scope.ts` puts on one side only, would pass its pull request and fail on `main`. A new kind of dependency between them means a new line in the script, and its test, `tests/scripts/ci-scope.test.ts`.
- On a pull request, the skipped steps show as skipped in each job, and the scope step's log says which flags it read.
