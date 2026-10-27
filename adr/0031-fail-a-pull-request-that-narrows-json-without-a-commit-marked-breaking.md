# 31. Fail a pull request that narrows --json without a commit marked breaking

Date: 2026-10-27

## Status

Accepted

## Context

Agents decide what to do from `--json` ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 5), and `docs/public/cli.schema.json` states what each command prints. `bun run schema` writes it from `src/cli/contract.ts`, and a test fails while the two differ, so a change to what a command prints is a change to that file in the same pull request. Nothing reads that change. Commits are the release notes ([ADR 3](0003-release-through-release-please-and-npm-trusted-publishing.md)): release-please bumps the minor version for a commit marked breaking and the patch for anything else. A pull request that drops a field an agent reads, typed `feat:`, ships as a patch that breaks the agent, and the changelog does not say so.

Whether a change can break a reader is decidable from the two schemas for nearly everything the schema states, once the reader is pinned down. The schema describes output, so the rules run the other way from an API's input: a field dek stops printing breaks a reader, and a field it starts printing does not.

## Decision

**A workflow, `Contract`, fails a pull request that narrows `--json` unless one of its commits is marked breaking.** `scripts/schema-compat.ts` compares the schema at the pull request's base with the schema in the merge, prints each change that can break a reader with its JSON Pointer, and exits 1 when there is one and no commit in the pull request has `!` after its type (`feat!:`, `feat(scope)!:`) or a `BREAKING CHANGE:` footer (`BREAKING-CHANGE:` too, as release-please reads both). The job checks out the merge with its history, sets up Bun, and runs the script. The script needs git and Bun and nothing from `node_modules`, so the job installs nothing and runs no dependency's code. Locally, `bun scripts/schema-compat.ts origin/main` compares the working tree with the point where the branch left `origin/main` and reads the commits since then.

**Each push to `main` is checked the same way,** against `main` before the push (`github.event.before`), reading the commits the push brought. A squash merge writes one commit of its own, and a `feat!:` among the pull request's commits becomes a line in that commit's body, which release-please does not read as a mark. Such a merge fails on `main`, before the release pull request takes the change, and the hint there is to merge a commit marked breaking first. On a pull request, a narrowing that is marked also gets a warning annotation: a squash merge must carry the mark into the commit it makes. A push with no commit before it on `main`, such as the branch's first, passes with a notice.

**The reader the script assumes** picks a command's schema by its name under `$defs`. It reads the properties it knows and ignores the rest. It tells a result's forms apart by their constants: `ok`, and `action` where a command has subcommands. It acts on each value an enum or a constant names. A change breaks it when the head takes away what the base promised, or lets through what the base ruled out:

- **Breaking:** a command gone from `$defs`; a form gone, so that no form in the head has the constants a form in the base had, such as `ref`'s `action: "rm"`; a property gone, required or optional; a required property made optional; a type that takes more, such as `string` to `string` or `null`, `integer` to `number`, or no type stated where one was; a value that an enum or a constant names, added or removed; a bound loosened (`minimum`, `maxLength`, and the like), or a `pattern` or `format` changed or dropped; a new form that reads as none of the old ones.
- **Not breaking:** a new command; a new property, required or not; an optional property made required; a type that takes less, such as `number` to `integer` or `string` or `null` to `string`; a union that drops a type; a bound tightened; a new form whose `action` no old form has; descriptions and other annotations.

A shape that commands share, such as `Diagnostic`, is compared once, under its own name, so a change to it is listed once rather than under every command that prints it. A `$ref` to a shape with another name, or a shape written out in its place, is followed and compared by what it holds, so a rename is no change. The bounds zod gives every integer, the safe integer range, are not bounds a reader relies on, and are ignored. Before it compares, the script checks every keyword anywhere in the head's schema, new commands and properties included. A keyword it does not compare, such as `prefixItems`, which `z.tuple` writes, or `allOf`, stops the change that first writes it, rather than passing unread and stopping the next change that compares it. The error names the keyword and where it is, and the hint is to teach the script what it means for a reader, with a test.

**Edge cases, decided:**

- **A new enum value is breaking.** A reader that branches on `severity`, a mark's `status`, or a skipped `check` has a branch for each value the schema names. The schema names a closed set, and a type generated from it is closed in code. A value the reader has never seen lands in a branch meant for something else. Adding a severity, a status, or a check that can be skipped needs `!`.
- **A removed enum value is breaking too,** though every value the head allows is one the base allowed. What the value reported still happens and is now reported another way: a reader waiting for a mark to be `edited` never sees it again.
- **A type that takes less is not breaking, null included.** `html` going from `string` or `null` to `string` leaves the reader's null branch unused and changes nothing else. If what null meant moves to another value, such as an empty string, the schema cannot show it, and the author marks the commit.
- **`action` names a subcommand.** A form with an `action` no old form has comes only from a subcommand that no existing reader runs, as a new command does. Any other new form must read as an old one: a third form of `ls` would come from a command readers already run, and would break them.
- **A new property is not breaking, though `additionalProperties: false` rules it out in the base.** That keyword says exactly what dek prints, so that the tests can hold every line to the contract. A reader ignores a field it does not know.

**What was not chosen:**

- **Breaking exactly when the head admits a value the base does not.** Through `additionalProperties: false`, it calls every new property breaking, and it calls no removed property breaking: the reverse of what a reader meets.
- **Reading the pull request's title.** Pull requests reach `main` as merge commits and as squash merges. The commits reach `main` in a merge; in a squash, only the commit GitHub writes from the title does. The pull request's run reads its commits, and the push to `main` reads what landed, so a title is read once it is a commit.
- **A label or a footer that waives the check.** While dek is 0.x, a false alarm costs a minor version. A waiver is one more thing for an agent to learn and to misuse. A rule that is wrong is fixed in the script, with a test, in review.
- **A JSON Schema differ from npm.** It would be a dependency, and its code would run, in a job that otherwise installs nothing ([ADR 19](0019-keep-dependency-code-away-from-the-tokens-that-publish.md)), and its rules would still have to be checked against what an output's reader meets.
- **Generating both schemas from the source.** The committed file is what the source states, since a test fails while they differ; generating it again would need an install at both commits.

## Consequences

A pull request that takes away or loosens what an agent reads in `--json` cannot merge as a patch without someone deciding so. The check names each place, and the way out is a `!` or keeping what was promised. A squash merge that drops the mark fails on `main` instead, after the merge and before the release; the way out there is a commit marked breaking, merged before the release pull request. Of the 13 commits that changed the schema after it was first published, the script finds a narrowing in none.

Adding a value to an enum, or loosening a bound, is now a breaking change; a release that only adds commands, forms, and properties stays a patch. A field that keeps its type and changes its meaning is still the author's to mark. The rules live in `scripts/schema-breaks.ts`, and a keyword new to the contract must be taught to them before the check passes.

The check runs on every pull request and every push to `main`, with no path filter, so that it can be made a required status check. Making it required is a branch protection setting, the maintainer's to set outside the repository.
