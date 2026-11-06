# 32. Let a plugin the user installed check a deck, and pin in the project what it promised

Date: 2026-11-06

## Status

Accepted

Amends [28. Let a project's code run only as a page, a ref's only in an offline sandbox, and the dev server act only for its own pages](0028-let-a-project-s-code-run-only-as-a-page-a-ref-s-only-in-an-offline-sandbox-and-the-dev-server-act-only-for-its-own-pages.md)

Amended by [33. Show a plugin's page in the player and builds behind page API 1](0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md)

Amended by [34. Ship dek-study inside dek as its first official plugin](0034-ship-dek-study-inside-dek-as-its-first-official-plugin.md)

## Context

dek is useful to an agent because lint lets the agent converge and then stop ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 2 and 6). Some conventions are not dek's to know. An event can ask for a title slide and a closing slide, or a team can ban words. A study tool built on dek, dekstudy, puts stickers over a slide's words, and needs every sticker to still find its word after the slide is edited. Today such a convention lives in a skill's prose, which an agent can misread and nothing checks. The way out has been to wrap dek in another command, which an agent has to know about and remember to run. A convention only that command checks is a false pass for an agent that runs `dekc lint` (S1).

Many tools have plugin systems, and the ones whose communities complain have the same failures:

- **Plugin code in the host's process.** The host's internals become the plugins' API, so the host cannot change them (webpack, Babel, Gatsby, unified's move to ESM, MkDocs 2.0's rewrite).
- **Plugins that transform the same input.** They need an order nobody can state (Vite's `enforce`, Babel presets, Prettier's plugin order, esbuild).
- **A project that can name code to run.** Cloning a repository then runs that code. git's `.git/config`, Jekyll's plugins on GitHub Pages, mise's tasks, and Marp's engine option have all had to close this.
- **Updates that land unseen.** A plugin's new version changes what runs, and nobody sees it change (Terraform's providers before their lock file, the MCP "rug pull", the Cyberhaven and GlassWorm extensions).
- **A shared rule namespace.** Two plugins' rule ids collide, or a plugin's rule shadows the host's (ESLint, Stylelint 16).

[ADR 28](0028-let-a-project-s-code-run-only-as-a-page-a-ref-s-only-in-an-offline-sandbox-and-the-dev-server-act-only-for-its-own-pages.md) already trusts the user and the environment they start dek in, `PATH` included. It does not trust the working directory as configuration of dek's own process. A plugin has to fit both: what the user installed may run, and a project may not add to it.

This record decides the first part of plugins, the check. Showing a plugin's own layer in the player and the build, and letting the dev server write a plugin's data, are for later records, each once dekstudy has shown it needs them.

## Decision

**A plugin is an executable the user installed, `dek-<name>`.** `<name>` is a lowercase letter, then lowercase letters, digits, and hyphens, 40 characters at most. `dek` and `md` are refused, since DEK is dek's own rule prefix and MD is rumdl's. dek talks to a plugin only through its standard streams, in JSON and SARIF. A plugin's code never runs in dek's process. A process of its own keeps a crash out of dek, not the plugin's privileges: it runs with the user's, as anything the user installed does, and dek does not call that isolation.

**A project names the plugins it uses, and nothing else about them.** `dek.toml` gets a table per plugin, `[plugins.<name>]`, which takes no key yet. A key in it is `DEK008`, like any key dek does not read, and a name that is no plugin's is an error, as a ref name is in `[refs]`. A project chooses among what the user installed. It never names a path, an argument, or a program.

**dek finds `dek-<name>` itself and starts it by its absolute path.** It searches the user's `PATH`, passing over every entry that is relative or whose real path is inside the project. bunx puts the project's `node_modules/.bin` on `PATH`, and direnv and mise can put the project's folders there, so a plugin committed to a repository someone else wrote is never the one that runs. On Windows, only an `.exe` is taken. That rule is written from what Windows does, not from a run on it.

**`dek-<name> manifest` prints the plugin's manifest**, the promise it makes:

```json
{
  "schema": 1,
  "name": "study",
  "version": "0.1.0",
  "check": {
    "protocol": 1,
    "rules": {
      "STUDY001": { "severity": "error", "summary": "a sticker's text is not on its slide" }
    }
  },
  "data": [{ "path": "study.yaml" }]
}
```

- `schema` versions the manifest's shape, and `check.protocol` the exchange below; each moves on its own. A manifest or protocol version this dek does not know means the plugin needs a newer dek, and that plugin alone is skipped with "update dek".
- A field dek does not know is dropped, and a missing one means absent. An older dek therefore never grants what a newer field asks for.
- A rule's id is the name in capitals, with `_` for `-`, then three digits (`acme-talks` checks `ACME_TALKS001`). Executable names cannot collide, so neither can ids, and no plugin's id can be dek's.
- A rule's severity is the manifest's. A finding's SARIF `level` is ignored, so an agent learns a rule's severity once, as it does dek's ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 5).
- A `summary` is one line of at most 120 characters. dek shows it only where a tool lists rules, in SARIF. No field holds guidance: what an agent reads about a plugin, dek writes, from facts it has checked.
- A data file is a path inside the deck, through no hidden folder, and none of dek's own files or folders (`script.md`, `theme.css`, `slides/`, `assets/`, `voice/`, `dist/`). For now dek only names data files to agents; the check reads them itself.

**The project pins what it accepted, and dek runs nothing else.** `dekc sync` runs `dek-<name> manifest` for each plugin `dek.toml` names. It writes the manifest, as this dek read it with its keys in one order, to `plugins/<name>/plugin.json` as `{ "accepted": … }`. That file is the lock, and the project commits it.

- **A plugin with no lock is accepted.** Naming it in `[plugins]` was the choice.
- **A manifest that differs from the lock is not written.** Sync lists each change in dek's words: the version, each rule added, removed, or with a new severity or summary, each data file, and a check added or removed. `dekc sync --accept <name>` pins it. `--accept` takes only a plugin `dek.toml` names, checked before anything is written.
- **The lock pins the promise, not the binary.** It holds no hash of the executable, which differs by platform. A lock written on a Mac passes on Linux CI, and a new build that keeps the same promise needs no acceptance.
- **A newer lock is read as a manifest is.** A field this dek does not know is dropped before the comparison. An older dek therefore sees no change in a lock a newer one wrote, unless it is asked to `--accept`.
- **Only an explicit `dekc sync` runs a plugin.** The dev server's sync on save, `lint --fix`, `new`, and `init` run none.

**`dekc lint` runs each pinned plugin's check, as it was pinned, on each deck.** For a plugin whose lock has a check, lint runs `manifest` and compares the manifest with the lock, then for each deck runs `dek-<name> check --protocol 1`:

- The working directory is the deck's folder.
- stdin holds the deck as a published shape, not dek's internal types: `{ "protocol": 1, "dek": <version>, "deck": { "name", "lang", "slides": [{ "slug", "title", "html", "css", "ts" }] } }`. Each path is relative to the deck, or null when the file is not there.
- stdout is SARIF 2.1.0. dek reads `ruleId`, `message.text`, the first location's `artifactLocation.uri` and `region.startLine` and `startColumn`, and `properties.hint`.
- A location must be a path inside the deck, relative to it or as a file URL, or it is dropped. A `slides/<slug>.(html|css|ts)` path gives the finding its slug.
- The message and hint are the plugin's words, which dek passes on as it does rumdl's. [ADR 30](0030-keep-a-ref-s-words-out-of-dek-s-hints-and-mark-what-a-ref-wrote-wherever-dek-prints-it.md) keeps a ref's words out of dek's hints, because a ref is a stranger's; a plugin is something the user installed. dek still makes each one line of at most 300 characters, as `foreignLine` does.
- The plugin promises the same output for the same input, no writes, and no network. It may be run on several decks one after another, and dek runs plugins one at a time, in name order.
- `manifest` gets 10 seconds and `check` gets 30, as rumdl does. After that the process is stopped with SIGTERM, then SIGKILL. A check that hangs is run on no deck after.

What lint does with each plugin:

- **It ran:** its findings join dek's in `--json` with the plugin's ids, and the exit code follows severity as for every finding. In `--format sarif`, each plugin has a run of its own, `dek-<name>`, with its version and the rules its lock declares, even when it found nothing. dek's own run holds only the ids in its rule table.
- **It did not run:** the plugin is not installed, its lock is missing or unreadable, its installed manifest differs from the lock, or it needs a newer dek. The check is reported as skipped, never as a pass ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 3), as `{ "check": "plugin", "plugin": "<name>", "reason", "hint" }`. CI and a laptop therefore run the same checks, or say they did not.
- **It failed:** `manifest` or `check` exited non-zero, timed out, printed no JSON or no SARIF runs, or reported an id its lock does not declare or a finding with no message. That is **`DEK046`**, an error, scoped to the deck. The message is `dek-<name> <version>` and what went wrong, `data` holds `plugin` and `version`, and the path is `dek.toml`, where the plugin is named. The hint says the plugin failed, not the deck, and to tell the user. Lint fails, because the checks the plugin makes did not run.

As rumdl's do, plugins run only in `dekc lint`, not in `dekc check`, the build, or the dev server.

**The shapes are published as types, and only as types.** `@hajimism/dek/plugin` exports `PluginManifest`, `PluginRules`, `CheckInput`, `CheckResult`, and `CheckOutput`, from `src/plugin-api.ts`. They have no code: a plugin shares the shapes with dek, never an implementation, so it depends on dek's contract and not on dek's version. dek builds what it sends a check as a `CheckInput`, and a test reads a manifest written to `PluginManifest`, so the published types and what dek does cannot drift apart. `CheckOutput<RuleId>` takes the manifest's rule ids, so a plugin written in TypeScript cannot report an id it did not declare. To publish them, `package.json` gets its first `exports`: `./plugin` and `./package.json`. A path into the package that is not exported, such as `@hajimism/dek/src/…`, stops resolving. No guide used one, and nothing outside dek's own files did.

**Agents learn about plugins from AGENTS.md and from `sync --json`, both in dek's words.** dek's block in `AGENTS.md` gets a `## Plugins` section when `dek.toml` names any, with one line per plugin, made from its lock without running it:

```
- `study` 0.1.0: `dekc lint` checks STUDY001 and STUDY002. Its data: `study.yaml`.
```

A plugin named but not pinned is listed as "not pinned yet; `dekc sync` pins it." Every sync, the dev server's included, writes the same block. `dekc sync --json` gets `plugins`: each plugin `dek.toml` names, in name order, with its `status` (`accepted`, `current`, `changed`, `missing`, `invalid`, or `unsupported`), the installed `version`, the `changes` for one that changed, and a `reason` and `hint` for one it could not pin. The field is absent when `dek.toml` names no plugin. Sync exits 0 whatever the plugins' status, since its own work is done, and says on stderr what it could not pin and what to run.

**What was not chosen:**

- **Plugins as modules dek imports,** as ESLint's and Vite's are. Their code would run in dek's process, through the project's `node_modules`, which ADR 28 part 5 keeps out. dek's internals would also become their API.
- **A `[plugins]` key that names a command or a path.** A project could then make dek run anything it ships, which is the hole git, Jekyll, mise, and Marp each had to close.
- **A hash of the executable in the lock.** It differs across platforms and builds, so every CI run would see a change nobody made.
- **Pinning the raw output of `manifest`.** Whitespace and key order would make a lock change with nothing promised changing.
- **A cache of the manifest.** Each command asks once per plugin, and a manifest is a constant. A cache keyed on the executable's path, modification time, and size is for when the dev server runs checks.
- **Running checks in parallel.** Plugins promise to tolerate it, and dek can start when it is needed.
- **Severity overrides, suppressions, and plugin subcommands of `dekc`.** dek has none for its own rules. A plugin has commands of its own, which the skill in `skills/dek/` cannot name ([ADR 9](0009-generate-llms-txt-from-its-sources-and-ship-one-skill-that-defers-to-the-installed-dek.md)).
- **Plugins that transform a deck.** They would need an order, which nothing so far needs.
- **A plugin's checks run by the dev server, or by `dekc check`.** rumdl's are not either.

## Consequences

- **A convention that dek does not know can be enforced where agents already stop.** A team writes a `dek-<name>` with two subcommands. The agent finds its findings in the `dekc lint` it already runs, and finds the plugin's rule ids and data files in AGENTS.md.
- **The `--json` contract changes in a way that breaks a reader.** A skipped check can now be `plugin`. [ADR 31](0031-fail-a-pull-request-that-narrows-json-without-a-commit-marked-breaking.md) counts a new enum value as breaking, so the commit is marked. `SkippedCheck` gains an optional `plugin`, and `sync` gains an optional `plugins`; neither breaks a reader.
- **A project now has `plugins/<name>/plugin.json`.** A change to what a plugin promises shows in `git diff`, and accepting one is a commit someone can review. The `.gitignore` dek writes leaves `plugins/` committed.
- **The user decides what may run.** Nothing in a cloned repository can add a plugin or change what an installed one runs. A plugin the user installed can still do anything the user can: dek pins its promise, not its code, and says so.
- **An agent can accept a change,** since `dekc sync --accept` is a command like any other. The hint says the user accepts it, the change shows in the lock's diff, and an agent that runs it has done what it was asked not to, visibly.
- **A plugin author imports types, not a library.** `import type { CheckOutput } from "@hajimism/dek/plugin"` is all a TypeScript plugin needs from dek; a plugin in any other language reads the reference page. A deep import into dek's files, which nothing promised, no longer resolves.
- **dek's rules range grows to `DEK046`.** It is documented in [the lint reference](../docs/reference/lint.md), and plugin authors get a reference page that states the manifest, the exchange, and the lock.
- **Later records decide the rest of plugins:** a plugin's layer in the player and the build, behind a versioned page API ([ADR 33](0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md)), and the dev server writing a plugin's data. Each adds to the manifest, as its schema allows, and none changes what this record decides.
