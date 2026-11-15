# 88. Test dek.pub's decisions as pure functions in Node, and its stores against D1 and R2 in workerd

Date: 2026-11-15

## Status

Accepted

Amends [43. Build dek.pub as a Void app and a serve Worker, checked on Miniflare](0043-build-dek-pub-as-a-void-app-and-a-serve-worker-checked-on-miniflare.md)

## Context

dek.pub had three kinds of tests (ADR 43): unit tests in Node, component tests in Chromium, and the serve Worker's tests in workerd against R2. Above them, one end-to-end run starts `vp dev` and drives the whole round trip with the real CLI.

The rules a model is made of, such as who may see a deck or whether a thread may be resolved, are pure functions in the model's plain files, and the unit tests hold them closely. Everything that reads D1 or R2 was in `*.server.ts` files, and 2 of 47 had any test below the end-to-end run. Some decisions had stayed inside those files with the queries around them: what the serve Worker hands out for a token, the seven refusals before a thread opens, which R2 keys a publish deletes, the API's cross-origin refusal. So had what only a database shows: whether a visibility filter is right, whether two requests at once take one counter each, whether deleting a deck reaches every table, whether a list of IDs fits in one statement. Each of those was tested only end to end, or not at all, and the end-to-end run grew to some 2,000 lines in one `try`, which tells little about what failed.

## Decision

**A decision goes in a pure function, tested in `tests/unit/` in Node.** A `*.server.ts` file reads and writes, and calls a pure function for anything it decides. The function goes in a plain file of the model whose rule it is, as `serving` in `deck/serving/access-file.ts` and `mustOpenThread` in `comment/new-thread.ts` do. Only what knows no model goes in `src/common/`: splitting a list of IDs for D1 (`chunks`), the API's refusals before a handler runs (`refusal`), retrying a write that lost a race (`untilWritten`), and a page's wording of a failed call (`failureText`). `tests/unit/boundaries.test.ts` already keeps a model out of `src/common/`, so a rule moved there by mistake fails it.

**A store is tested in `tests/medium/` against D1 and R2 in workerd.** A `medium` project in `vitest.config.ts` runs them through `@cloudflare/vitest-plugin`, as the serve Worker's tests run, now a dev dependency of the app as well. Each test file starts from a D1 with every migration in `db/migrations/` applied, and each test from storage of its own. Void's runtime `void/db` and `void/storage` read the `DB` and `STORAGE` bindings from the Worker's environment, so the stores run unchanged: nothing stands in for Void, and only `@schema` is aliased to `db/schema.ts`. These tests hold what only D1 and R2 show: a query's filter, a counter taken by requests at once, the order of writes to D1 and R2 when one fails (with a write to R2 made to fail), and a sweep across tables. `bun run test` runs them with the unit and component tests.

A store that needs Better Auth, through `authOf(c)` and a request's context, is not tested there yet: `peopleById`, and the lists that name their authors through it.

**The end-to-end run checks journeys.** A promise to a person, such as "a deck you may not see is a 404" or "review comments come back to `dekc`", keeps one path through the real CLI and `vp dev`. What a unit or medium test already holds need not be checked there again.

**Rejected:**

- **Testing the stores in Node with D1 mocked.** A mock answers what the test says it does, so it shows neither a wrong filter nor D1's limit of 100 bound values, which is the bug that `chunks` fixed.
- **A stand-in for `void/db` in the medium tests.** Void's own runtime module reads the binding as a deployed Worker does, so a stand-in would only differ from production.
- **Moving decisions into `src/common/` to share them.** `src/common/` knows no model by rule (ADR 50); a deck's or a comment's rule belongs to that model, and is tested there just as well.

## Consequences

- A rule outside the database is tested in milliseconds, without a server. The medium tests take a few seconds and need no account and no `vp dev`.
- The medium tests already cover the order of `updateDeck`'s writes to the access file (ADR 87), with failures injected, and fail when that order is undone; the 404 of a deck by grant, by link key, and for a deck that is not there; `deleteDeck` reaching every table `DECK_ROWS` names and nothing of another deck; thread numbers taken at once; and the gate on new accounts in `sign_up_invites` and waiting grants.
- `bun run test` starts workerd, as `test:serve` does.
- The end-to-end run can shrink to a journey for each promise once the medium tests cover what it checks besides. That is not done here.
- `peopleById` and the comment lists that use it stay tested end to end only, until the medium tests can make a request context with Better Auth in it.
