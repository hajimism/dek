# 35. Let a plugin keep data for the whole project in plugins/<name>/

Date: 2026-11-07

## Status

Accepted

Amends [32. Let a plugin the user installed check a deck, and pin in the project what it promised](0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md)

Amends [33. Show a plugin's page in the player and builds behind page API 1](0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md)

## Context

[ADR 32](0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md) lets a plugin name data files, and each one is a path inside the deck. That fits dek-study, whose stickers belong to one deck. It does not fit a convention a team holds across its decks. The case that brings this up is a list of words a team does not want in its talks, such as the words an AI tends to write ([ADR 36](0036-ship-dek-words-a-check-for-a-project-s-word-list-as-the-second-official-plugin.md)). The project that asked for it has fifteen decks. A list in each deck would be copied fifteen times and drift apart, and a new deck would start with none.

A plugin that wants such a file today has two ways, and neither holds. It can read a file it finds by walking up from the deck's folder, which no manifest declares: AGENTS.md would not name it, `dekc sync` would not show it changing, and a `decks/` folder that is a link to elsewhere in the project puts the walk somewhere else. Or it can read a file in the user's home, which differs between a laptop and CI, so the same commit would pass in one and fail in the other ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 3).

The project already has a folder for each plugin it pins, `plugins/<name>/`, which holds the lock and which the project commits.

## Decision

**A plugin may keep data for the whole project in `plugins/<name>/`, beside its lock.** A data entry in the manifest takes `"in": "project"`, and its path is then relative to that folder:

```json
"data": [{ "path": "words.yaml", "in": "project" }, { "path": "words.yaml" }]
```

- The path follows the rules a deck's data path does: `/`-separated, inside the folder, through nothing hidden. `plugin.json`, the lock, is refused. dek's own deck files are not in this folder, so that rule does not apply.
- An entry without `in` is the deck's, as before. `in` takes only `"project"`. A manifest with any other value does not read.
- An entry is the pair of `in` and `path`, so a plugin may name the same file name at both levels, as dek-words does.
- The lock keeps `in` where the manifest gave it. `dekc sync` lists a project entry added or removed as `data plugins/<name>/<path> added` or `removed`. AGENTS.md names it by the same path, before the deck's: ``Its data: `plugins/words/words.yaml`, `words.yaml`.``

**The check is told where the folder is.** `CheckInput` gains `pluginDir`: the absolute path of `plugins/<name>/` in the project, whether or not the folder exists. It is absolute because a deck's folder can be reached through a link, and a path relative to the deck would then lead somewhere else. The published type has it as optional, since a dek before this record does not send it, and a plugin must treat its absence as "no project data". The protocol stays 1: the shape grows only by adding.

**A finding may point at a file in that folder.** dek reads a location inside the deck, as before, or inside the plugin's own `plugins/<name>/`, given as a file URL. A location in any other plugin's folder, or anywhere else, is still dropped. lint runs a check once per deck, so a finding on a project file comes back once for each deck; of findings on a file in that folder that are the same in rule, path, line, column, and message, lint keeps the first, in its output and in the plugin's SARIF run. A finding on a deck's file, or on no file, is that deck's, and is kept for each deck however alike they read.

**Project data is for the check alone, for now.** The page API's `data(path)` ([ADR 33](0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md)) serves the deck's entries only, and the dev server reloads a page for a change in those only, as before. A project file would be copied into every deck's built page, and no plugin's page needs one yet.

**What was not chosen:**

- **A key in `[plugins.<name>]` holding the data.** dek.toml would become each plugin's configuration file, in a shape dek cannot check, and ADR 32 keeps that table for naming the plugin.
- **A folder of the project the plugin names itself,** such as a path in its manifest. A plugin could then make dek name any file of the project to an agent as its data, and its findings could point anywhere. `plugins/<name>/` is the one folder each plugin already owns.
- **A list in the user's home.** CI and a laptop would run different checks on the same commit.
- **The project root in `CheckInput`.** A plugin would then find its folder by joining names itself, and the record would not say which folder is its own. Giving it the folder says that.
- **A new protocol for this.** Nothing changes for a plugin that does not read `pluginDir`.

## Consequences

- **A team's convention can live once per project.** A plugin reads it from `plugins/<name>/`, AGENTS.md names it, and a change to it is a commit in one place.
- **`in` is part of manifest schema 1 from its first release.** No released dek reads a plugin's manifest yet (ADRs 32 to 34 are not in 0.5.1), so no dek reads a project's entry as the deck's by dropping `in`. A later field that changes where a path is read raises the schema, so a dek that does not know it skips the plugin and says why.
- **`CheckInput` has a field that is not relative to the deck.** Every other path in it still is.
- **`dekc pack` carries a deck, not `plugins/`.** A packed deck loses the project's data, as it loses `dek.toml`'s other tables.
- **A page that wants project data waits for a record of its own,** which decides whether a built file carries it.
