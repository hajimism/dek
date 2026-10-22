# 18. Ship an optional design skill and raise the official skill's floor to 0.2.2

Date: 2026-10-22

## Status

Accepted

Amends [9. Generate llms.txt from its sources and ship one skill that defers to the installed dek](0009-generate-llms-txt-from-its-sources-and-ship-one-skill-that-defers-to-the-installed-dek.md)

## Context

[ADR 9](0009-generate-llms-txt-from-its-sources-and-ship-one-skill-that-defers-to-the-installed-dek.md) ships one skill, `dek`, that names only commands every dek since 0.2.0 has. Two kinds of help it leaves out keep coming up.

One is the review with the human. Annotate mode, `a` on the dev server's page, lets the author point at an element and write a note, and `dekc annotations` hands the notes to the agent. That loop is where the human judges what lint cannot, and it is the part of dek no other tool has. The skill does not teach it: `dekc annotations` came in 0.2.2, above the floor, so the skill only says that `dekc help --agent` lists such commands. An agent reads the command in `AGENTS.md`, but not the order of work with a person who may not know dek: start the server, ask them to point, fix, ask again.

The other is design. Lint measures what a rule can, such as overflow, contrast, and the class budget. Whether the heading says a claim, whether one thing stands out and it is the main point, and whether every change of color or place means something are left to the agent, which tends to vary a slide for variety. [ADR 11](0011-write-the-agent-guidance-as-what-the-checks-and-commands-do.md) keeps `AGENTS.md` to what the checks and commands do, so these principles have no home there. Not every author wants them either: a team with its own design rules wants its own.

A separate skill for the review was considered and dropped. Its core is the annotate loop, which every author of a dek deck can use, and the rest, such as committing the deck and exporting a PDF at the end, is one author's habit. Two skills that both match "make slides with dek" would also leave the agent guessing which to load.

## Decision

**The official skill teaches the review, and its floor moves to 0.2.2.** Its section on the human now says: start the dev server in the background, with `dekc <deck> --port` or the harness's preview tool; ask the human to press `a`, click, and write a note; read `dekc annotations <deck> --json` and fix each note, comparing a new shot with the note's; ask again until the human says the deck is done; leave `dekc annotations clear` to them. Its "First" section says it is written for dek 0.2.2 or newer, and that with an older dek the agent follows only `dekc help --agent` and `AGENTS.md`. The test's list of floor commands gains `annotations`.

**One optional skill, `dek-design`, in `skills/dek-design/`.** It is the principles for slides that read at a glance: what to settle before starting, one claim per heading, about four groups at most, one focal point, edges lined up across a row and down a column, a change in look only for a change in meaning, and charts by position and length. Its checks use dek: `dekc ls` for the headings in order, `dekc shot --sheet` and `fill` for where the eye lands, and only what `dekc theme` lists. It is short and in plain English, and holds to the same floor as the official skill.

**It installs apart.**

- The skills CLI: `npx skills add hajimism/dek --skill dek-design`. The docs now pass `--skill dek` for the official one, since without it the CLI asks which skills to install.
- Claude Code: the marketplace lists two plugins. `dek` keeps the root as its source, beside `.claude-plugin/plugin.json`, and lists `skills: ["./skills/dek/"]`: for an entry whose source is the marketplace root, that loads only the listed folder, so installing `dek@dek` does not bring the design skill. `dek-design` takes its own folder as the source, with no manifest; a plugin that holds only `SKILL.md` loads as one skill, named by its entry. `/plugin install dek-design@dek`.
- The npm package already ships `skills/`, so both come with it; `scripts/check-package.sh` checks each is there.

The test holds every folder in `skills/` to the floor, and fails on one it does not list. The rest of ADR 9 stands.

## Consequences

An agent with the official skill leads the human through a review without being told how, and an author who wants design help adds one skill for it. A project on dek 0.2.0 or 0.2.1 is told by the skill that it is older than the skill expects, rather than being sent to a command it lacks.

The design skill is text the test checks only for its commands; a principle that has gone stale is caught by no one but its readers. A further skill means a new folder, a marketplace entry, and a line in the test's list.
