# 9. Generate llms.txt from its sources and ship one skill that defers to the installed dek

Date: 2026-10-06

## Status

Accepted

## Context

An agent meets dek in three places today: dek's block in `AGENTS.md`, which `dekc sync` writes for the installed version; `dekc help --agent`, printed from the command specs; and `docs/public/llms.txt`, written by hand for agents outside any project. The hand-written one had drifted: it said "DEK001 to DEK044" while `DEK045` existed, and it knew nothing of `dekc marks` or annotate mode. Slidev publishes `llms.txt`, an official skill, and a Claude Code plugin; open-slide and HyperFrames ship skills too. dek's way in was thinner, and the one entry it had was wrong.

dek has no MCP server and wants none ([Working with AI Agents](../docs/guide/ai.md)): an agent already has a shell, and the CLI is the interface. A skill fits that: it is text that teaches an agent to use the CLI. Its risk is the gap between versions. A skill is installed apart from dek, often from the repository's latest commit, and a project may pin an older dek; a skill that teaches a command the project's dek lacks sends the agent into an error.

## Decision

**Each fact has one home, and every entry is built from it or checked against it.**

| Fact | Home | Read by |
| --- | --- | --- |
| Commands and flags | the specs in `src/cli/commands.ts` | `dekc help --agent`, `dekc help`, the CLI reference (checked), `llms.txt` |
| Rules | `RULES` in `src/core/diagnostic.ts` | the lint reference, `llms.txt` |
| Conventions for the installed version | dek's block in `src/core/sync.ts` | `AGENTS.md` |
| What each docs page covers | its `description` frontmatter | the site's meta description, `llms.txt` |
| The loop and the traps | `skills/dek/SKILL.md` | the skill |

**`llms.txt` is generated.** `bun run llms` writes `docs/public/llms.txt` from the docs' sidebar order, each page's `#` title and `description`, the rule table's range and count, the package and command names in `package.json`, and `dekc help --agent` verbatim. A test fails while the committed file differs, as one does for `cli.schema.json`. It carries no version number, so a release, which changes only `package.json`, does not make it stale. It stays one English file linking the Japanese site: it is read by agents, and each docs page it lists has its Japanese twin at the same path under `/ja/`.

**One official skill, `skills/dek/SKILL.md`, that never runs ahead of the installed dek.** It teaches what changes rarely: run it as `dekc` and never `dek`, on Bun with `bunx` and never `npx`; ask the installed dek first, with `dekc --version`, `dekc help --agent`, dek's block in `AGENTS.md`, and `dekc theme`; script first; one slide at a time through `show`, an edit, `check --shot`, and `lint --visual`; and when to stop. It names only commands every dek since 0.2.0 has, and says the installed dek wins over it. A test holds it to that: every `dekc <command>` it names is in a list of 0.2.0's commands, which moves only with an edit to the skill that says so; every command and DEK id it, `AGENTS.md`, and `llms.txt` name exists. Newer features, such as annotations, are reached through `dekc help --agent` rather than named.

**Three ways to install it, one file.**

- The [skills CLI](https://github.com/vercel-labs/skills), `npx skills add hajimism/dek`, which reads `skills/<name>/SKILL.md` from the repository.
- A Claude Code plugin marketplace in the repository itself: `.claude-plugin/marketplace.json` lists one plugin, `dek`, whose source is the repository root, and `.claude-plugin/plugin.json` names it. `/plugin marketplace add hajimism/dek`, then `/plugin install dek@dek`. Neither manifest carries a version, so release-please has nothing to bump and the plugin follows the marketplace.
- The npm package: `skills` joins `files`, so `node_modules/@hajimism/dek/skills/dek/SKILL.md` is always the copy for the dek a project has. `scripts/check-package.sh` checks it is there.

**English only**, like `AGENTS.md` and `dekc help --agent`: agents read English, and answer in the user's language.

**No MCP server**, still. The skill is the CLI's, not a second interface.

## Consequences

An agent that has never seen dek can find, from `llms.txt` or a one-line install, how to run it and how to work, and it reaches the installed version's own guidance before it acts. `llms.txt` can no longer go stale silently: a new rule, command, or page, or a changed description, fails a test until `bun run llms` is run.

Every docs page now needs a `description`, in both languages, which the site also uses. The skill says less than it could: a command added after 0.2.0 appears in it only once the floor is raised on purpose. Two small JSON files at the repository root belong to Claude Code.
