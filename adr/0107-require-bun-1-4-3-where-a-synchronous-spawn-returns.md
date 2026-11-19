# 100. Require Bun 1.4.3, where a synchronous spawn returns

Date: 2026-11-18

## Status

Accepted

## Context

`check (bun 1.4.0)` fails on `main`. The merge of #154 failed 40 tests there and passed `check (bun latest)`, which ran Bun 1.4.4. The merges of #151 and #152 failed the same job, and the release-please push between them passed it, on the same 3,224 tests. The failures are the slide-script checks. `Bun.spawnSync` of the evaluator either comes back after its 5 second budget with no answer, reported as "top-level code did not finish", or does not come back until the test's 20 second timeout. None of those commits changed the evaluator.

[Bun 1.4.3](https://bun.com/blog/bun-v1.4.3) (2026-10-10) records the cause. On macOS and Linux, `spawnSync` or `execFileSync` could spin and never return after a garbage collection during an earlier `Bun.spawnSync` freed a stream, such as a previous test file's `process.stderr`. Large `bun test` suites hit it. Bun 1.4.0, 1.4.1, and 1.4.2 have it, and 1.4.3 fixes it. dek evaluates every slide script with `Bun.spawnSync` (`src/core/slide-script-eval.ts`), and CI runs `bun test --parallel`, so the floor CI claimed to test is the Bun that drops the child exit.

## Decision

**dek requires Bun 1.4.3 or later.**

- `package.json` `engines.bun` is `>=1.4.3`.
- Every workflow that pinned 1.4.0 pins 1.4.3: the `check` matrix, `package`, `pub`, Pages, Nightly, release, contract, and infra. `check (bun latest)` stays, and catches drift in Bun itself.
- The required status check on `main` is `check (bun 1.4.3)`, in place of `check (bun 1.4.0)`. [ADR 91](0091-run-only-the-ci-checks-a-pull-request-s-files-need-and-every-check-on-main.md) still splits checks by path, and a matrix job still has to report under its expanded name.
- The READMEs, CONTRIBUTING, and the getting-started and tutorial pages, in English and in Japanese, say 1.4.3. The why-dek sample slide that quotes that requirement says 1.4.3. `mise.toml` stays on the `1.4` line, which installs a 1.4 newer than the floor.

**Rejected:**

- **Re-running the red job.** The same lost exit failed three pushes and passed one, so a green re-run does not hold.
- **Dropping `--parallel`.** It makes the lost exit less common and leaves it in `dekc lint` and the dev server, which call `Bun.spawnSync` on every pass.
- **Replacing only the evaluator's `Bun.spawnSync` with an async spawn.** The synchronous path is what CI and `dekc lint` run, and a synchronous `node:child_process` spawn waits in the same place. Other `spawnSync` calls would stay on a Bun that loses exits.
- **Leaving `engines` at `>=1.4.0` and moving only the test job.** CI would stop testing the Bun the package claims to run, and a long `dekc` process on 1.4.0 or 1.4.2 can still hang in that wait.

## Consequences

Someone on Bun 1.4.0, 1.4.1, or 1.4.2 upgrades before this release. That is a breaking change. `tests/core/bun-runtime.test.ts` fails if `engines.bun`, the `check` matrix, and the Pages workflow disagree.

The required check changes name. Until the ruleset on `main` requires `check (bun 1.4.3)`, a pull request cannot merge: the old name never reports.
