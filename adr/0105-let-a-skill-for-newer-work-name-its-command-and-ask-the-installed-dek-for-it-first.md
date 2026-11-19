# 105. Let a skill for newer work name its command, and ask the installed dek for it first

Date: 2026-11-19

## Status

Accepted

Amends [9. Generate llms.txt from its sources and ship one skill that defers to the installed dek](0009-generate-llms-txt-from-its-sources-and-ship-one-skill-that-defers-to-the-installed-dek.md)

## Context

A skill is installed apart from dek, so ADR 9 holds every skill to the commands of the oldest dek the official one teaches, 0.2.2 since ADR 18, and a test fails when one names a newer command. That keeps the official skill from telling a project to run what its dek lacks. It also means no skill can teach work only a newer dek does: `dek-pptx` ([ADR 104](0104-build-a-pptx-again-from-json-an-agent-writes-with-dekc-pptx-spec-and-dekc-pptx-from.md)) is about `dekc pptx spec` and `dekc pptx --from`, and `pptx` is not among 0.2.2's commands at all.

Moving the floor up for every skill would make the official one wrong for every project on an older dek, which it is written to serve.

## Decision

**Each skill has a floor of its own.** The official skill and `dek-design` keep 0.2.2's commands. A skill for work a newer dek added may name that command too: `dek-pptx` may name `pptx`. The test holds each skill to its own list.

**Such a skill asks the installed dek first.** Its first step has the agent run `bunx dekc help <command>` and look for what the skill needs, and stop and say so when it is not there, rather than run a command the project's dek lacks. The test holds `dek-pptx` to saying that it checks for `spec` and `--from`. A version number would say the same, but release-please picks it when the release is cut; the help text is what the installed dek says of itself.

**Optional skills ship as `dek-design` does**: in `skills/`, in the npm package, which `scripts/check-package.sh` checks, and in `.claude-plugin/marketplace.json`, and the docs and `llms.txt` name them.

## Consequences

A skill can teach work a newer dek does as soon as that dek ships it, and an agent on an older dek is told so in its first step instead of meeting an unknown command later.

A skill's floor is now in two places, its own first step and the test's list, and a skill that grows to need another command must move both; the test fails until it does.
