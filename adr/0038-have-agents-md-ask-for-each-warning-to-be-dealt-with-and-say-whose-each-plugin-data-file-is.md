# 38. Have AGENTS.md ask for each warning to be dealt with, and say whose each plugin data file is

Date: 2026-11-07

## Status

Accepted

Amends [35. Let a plugin keep data for the whole project in plugins/<name>/](0035-let-a-plugin-keep-data-for-the-whole-project-in-plugins-name.md)

## Context

An agent used dek-words for a project of fourteen decks and then for a new deck, and reported two gaps in what the generated `AGENTS.md` told it.

**Warnings had no step.** `AGENTS.md` lists what to do before reporting a deck as done, and its first item was that `dekc lint --visual` passes. A warning never fails it ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 6), and ADR 36 made a listed word a warning so that an agent does not rewrite a correct sentence to pass. On the new deck, lint passed with fourteen `WORDS001` warnings. An agent that followed `AGENTS.md` to the letter would report that deck done. ADR 36 said a team that wants a word gone checks its warnings before merging, but nothing told the agent to look. The skill in `skills/dek/` did say "Warnings do not fail it; read them and decide", so the two sources an agent reads disagreed.

**Plugin data did not say whose it was.** ADR 35 had `AGENTS.md` name a project file by its path in the project and a deck's file by its path in the deck, the project's first: `` Its data: `plugins/words/words.yaml`, `words.yaml`. `` The agent could not tell that the second was a file in each deck. To write either it needed the format, and the installed package holds none of it: `docs/` is not in the package, and the skill does not name a plugin. The agent wrote the files because it had dek's own repository at hand. An agent in any other project would have had to find the site.

## Decision

**The first item before reporting a deck as done says what to do with warnings:**

> `dekc lint --visual` passes. Warnings do not fail it: fix each one, or tell the author which you kept and why.

A warning still never fails lint. Keeping one is allowed; keeping it without a word is not. The item says what the skill already says, so an agent that reads either gets the same step.

**Each plugin data file in `AGENTS.md` says whose it is:** `` Its data: `plugins/words/words.yaml` in the project, `words.yaml` in each deck. `` The order ADR 35 set, the project's first, stays.

**A plugin dek ships links dek's page on how to write its data,** at the end of its line: `How to write it: https://hajimism.github.io/dek/reference/plugins.html#dek-words`. dek wrote that page, so the link is dek's words, as everything in the block is (ADR 32). A plugin the user installed gets no link: the manifest has no field for one, and a link the plugin chose would be the plugin's words in dek's block.

**What was not chosen:**

- **A flag that fails lint on chosen warnings, such as `--deny WORDS001`.** ADR 32 keeps severity overrides out, as dek has none for its own rules, and a warning that must be dealt with before the deck is reported done is what this item asks for already. If agents still leave warnings unread, the case for a flag will have evidence.
- **Ranking warnings in `AGENTS.md`,** such as `DEK041`, the talk's length, as one to leave until the script is final. A rule's hint is where its timing belongs, and the item covers the deck when it is done, when every warning applies.
- **A field in the manifest for a plugin's own guide.** It changes the manifest, its lock, and what `dekc sync` reports; one plugin author has needed it so far, and that author is dek.

## Consequences

- **An agent that follows `AGENTS.md` reports the warnings it kept,** so the author sees a listed word that stayed instead of finding it later.
- **`AGENTS.md` and the skill agree** on warnings.
- **An agent can write dek-words' list and dek-study's file from a link in `AGENTS.md`,** whatever project it is in.
- **Every project's `AGENTS.md` changes on its next `dekc sync`**, inside dek's block.
- **The line ADR 35 quotes is now longer;** what ADR 35 decided, the paths and their order, stands.
