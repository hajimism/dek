---
description: 'A plugin is a dek-<name> executable that checks decks in dekc lint: how a project uses one, and the manifest, check, and lock a plugin author writes to.'
---

# Plugins

A plugin adds checks that dek does not know, such as an event's slide rules or a study tool's stickers, to the `dekc lint` an agent already runs. A plugin is one executable, `dek-<name>`, that the user installs. It runs in a process of its own and talks to dek in JSON and SARIF. The decision and its reasons are in [ADR 32](https://github.com/hajimism/dek/blob/main/adr/0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md).

## Official plugins

dek ships one plugin, dek-study, in its own package. Using it takes no install: name it in `dek.toml`, and dek runs it from its own files, never a `dek-study` on `PATH` ([ADR 34](https://github.com/hajimism/dek/blob/main/adr/0034-ship-dek-study-inside-dek-as-its-first-official-plugin.md)).

### dek-study

Stickers over the words a reader of a study deck should be able to recall. In the dev server and in a built file, a sheet lays the stickers over the slides; the checks keep each sticker on its words as the slides change.

```toml
[plugins.study]
```

The stickers live in `study.yaml`, in the deck's folder:

```yaml
version: 1
stickers:
  - id: s_8k2f                   # unique in the deck
    slide: planning-fallacy      # the slide's slug
    quote: 外部視点               # the words the sticker hides
    prefix: 楽観的に見積もる傾向に、  # optional: the words right before, to tell two places apart
```

A slide's words are the text a reader sees in its HTML: not inside `script`, `style`, `template`, or `noscript`, nor in comments, with each run of whitespace read as one space. In a language written with spaces between words, a quote is whole words: `is` is not found in "This". In Japanese, Chinese, Korean, or Thai it is any run of the words. A sticker with a `prefix` covers the first place its quote follows that prefix; one without covers the first place left. Write a value YAML would read as a number or as true or false, such as `1868`, in quotes.

| ID | Severity | Condition |
| --- | --- | --- |
| `STUDY001` | error | A sticker's words are not on its slide, or its slide is not in the deck. When they are gone from it and on exactly one other slide, the hint names it; when they are still on it, the message says whether the prefix no longer matches or another sticker took each place |
| `STUDY002` | warning | A sticker's words show again on its slide where no sticker covers them |
| `STUDY003` | error | `study.yaml` does not read: not YAML, a `version` other than 1, a sticker without `id`, `slide`, or `quote`, a sticker's words YAML reads as a number or as true or false, or two stickers with one id. The other stickers are still checked |

Every finding points at the sticker's line in `study.yaml`. A deck without `study.yaml` has nothing to check.

#### The sheet

Once `dekc sync` has pinned dek-study, every slide in the dev server and in `dekc build`'s file carries the sheet:

- **`r`** lays the sheet on, or takes it off. It starts off, and each browser remembers it for the deck. A notice in the corner, SHEET ON or SHEET OFF, says which.
- **A sticker** is a slip of pale yellow paper with square corners, like a sticky note.
- **Point at a sticker,** and it fades away at once, leaving a yellow rule under the words, until the pointer leaves.
- A sticker over a beat still to come waits for the beat, so it does not give away what the beat will show.
- In the dev server, an edit to `study.yaml` reloads the page.

The sheet is never in the presenter view, a screenshot, a PDF, pptx, or video, nor in the visual lint. The rail's thumbnails do not carry it yet, so the words show there.

## Using a plugin

These steps are for a plugin someone else wrote; an official one skips the first.

1. Install `dek-<name>` somewhere on your `PATH` outside the project.
2. Name it in `dek.toml`:

   ```toml
   [plugins.glossary]
   ```

3. Run `dekc sync`. It asks the plugin for its manifest and writes it to `plugins/glossary/plugin.json`, the lock. Commit the lock.
4. Run `dekc lint`. The plugin's findings appear with dek's, under the plugin's rule ids (`GLOSSARY001`, …).

AGENTS.md lists each plugin, with its version, its rule ids, and its data files, so an agent knows what lint checks.

### The lock

`plugins/<name>/plugin.json` holds the manifest the project accepted: the plugin's version, its rules and their severities, and its data files. The same folder holds the data a plugin keeps for the whole project, such as a list every deck is checked against; commit it with the lock. `dekc lint` runs a plugin only while the installed one promises exactly what the lock says. So a teammate or CI with another version runs no check rather than another one, and says so.

When the installed plugin's manifest changes, for example after an update, `dekc sync` lists what changed, such as `version 0.1.0 → 0.2.0` or `GLOSSARY003 added (error)`, and leaves the lock alone. Read the changes, then accept them:

```bash
dekc sync --accept glossary
```

The lock pins what the plugin promises, not its binary, so a lock written on macOS holds on Linux CI.

### What a project can and cannot do

A project only chooses which of the plugins the user installed it uses. `[plugins.<name>]` takes no key: a key there is `DEK008`. A project cannot name a path, an argument, or a program to run. dek looks for `dek-<name>` only on `PATH`, and passes over every `PATH` entry that is relative or inside the project. Those include the project's `node_modules/.bin`, which `bunx` adds, and folders direnv or mise add. A plugin committed to a repository you cloned never runs. So `bun add -d dek-<name>` installs one dek does not run either; dek says so, and names where it found it.

A plugin runs with your privileges, as anything you install does. Its own process keeps a crash away from dek, and nothing more.

### When a plugin does not run

`dekc lint` never counts a plugin that did not run as a pass. Each one is listed under `skipped` in `--json` as `{ "check": "plugin", "plugin": "<name>", "reason", "hint" }`:

- it is not installed;
- the project has no lock for it yet (`dekc sync` writes one);
- the installed plugin differs from the lock (`dekc sync` shows how);
- it needs a newer dek.

A plugin that fails is [`DEK046`](/reference/lint#rules), an error. It failed if its manifest or check exits non-zero, runs past its time, prints no SARIF, or reports a rule its lock does not declare. The deck is not at fault; the hint is to tell the user.

Plugins run only in `dekc lint`, like rumdl. `dekc check`, `dekc build`, and the dev server do not run them.

## Writing a plugin

A plugin is an executable named `dek-<name>`. `<name>` is a lowercase letter followed by lowercase letters, digits, and hyphens, at most 40 characters; `dek` and `md` are taken. On Windows it must be an `.exe`. It answers two subcommands; anything else it does is its own.

A plugin in TypeScript gets the shapes below as types from dek, with no code:

```ts
import type { CheckInput, CheckOutput, PluginManifest } from "@hajimism/dek/plugin";
```

`PluginManifest<"GLOSSARY">` checks the rule ids' prefix, and `CheckOutput<"GLOSSARY001" | "GLOSSARY002">` refuses a finding under an id the manifest does not declare.

### `dek-<name> manifest`

Prints the manifest as JSON on stdout and exits 0:

```json
{
  "schema": 1,
  "name": "glossary",
  "version": "0.1.0",
  "check": {
    "protocol": 1,
    "rules": {
      "GLOSSARY001": { "severity": "error", "summary": "a term is used before it is defined" },
      "GLOSSARY002": { "severity": "warning", "summary": "a term is spelled two ways" }
    }
  },
  "data": [{ "path": "glossary.yaml" }]
}
```

| Field | Meaning |
| --- | --- |
| `schema` | The manifest's version: `1`. A dek that does not know it skips the plugin and says to update dek |
| `name` | The `<name>` of `dek-<name>` |
| `version` | One token of letters, digits, `.`, `+`, and `-`, at most 64 characters |
| `check` | Optional. Without it, dek runs no check |
| `page` | Optional: `{ "api": 1, "keys": ["r"] }`, a page in the player and the build that calls page API 1, and the letters it binds, none of dek's own (`a f l m p s`). For now only an official plugin's page reaches a deck ([ADR 33](https://github.com/hajimism/dek/blob/main/adr/0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md)) |
| `check.protocol` | The version of the exchange below: `1` |
| `check.rules` | Every rule id the check can report. An id is the name in capitals, with `_` for `-`, then three digits: `glossary` → `GLOSSARY001`, `acme-talks` → `ACME_TALKS001` |
| `…severity` | `error` or `warning`. dek uses this, not a result's SARIF `level`; only an error fails lint |
| `…summary` | One line, at most 120 characters. dek shows it only in SARIF's rule list |
| `data` | Optional. Files the plugin reads, which AGENTS.md names. `{ "path": "glossary.yaml" }` is in the deck, relative to its folder: not hidden, not outside the deck, and none of dek's own (`script.md`, `theme.css`, `slides/`, `assets/`, `voice/`, `dist/`). `{ "path": "terms.yaml", "in": "project" }` is in `plugins/<name>/` in the project, for data every deck shares: not hidden, not outside that folder, and not `plugin.json`. Only the deck's files reach a page ([ADR 35](https://github.com/hajimism/dek/blob/main/adr/0035-let-a-plugin-keep-data-for-the-whole-project-in-plugins-name.md)) |

dek ignores a field it does not know. The manifest has no field for guidance: what agents read about a plugin, dek writes from these facts. Print the same manifest every time; dek gives it 10 seconds.

### `dek-<name> check --protocol 1`

dek runs it once per deck, in the deck's folder, with the deck as JSON on stdin:

```json
{
  "protocol": 1,
  "dek": "0.5.1",
  "deck": {
    "name": "intro",
    "lang": "ja",
    "slides": [
      { "slug": "planning-fallacy", "title": "計画錯誤", "html": "slides/planning-fallacy.html", "css": null, "ts": null }
    ]
  },
  "pluginDir": "/home/me/talks/plugins/glossary"
}
```

Each slide's path is relative to the deck's folder, or `null` when the file is not there. `pluginDir` is the absolute path of `plugins/<name>/` in the project, where a `data` file with `"in": "project"` is, whether or not the folder exists; a dek older than this field does not send it, which means no project data. Read the files yourself.

Print SARIF 2.1.0 on stdout and exit 0, with or without findings. A non-zero exit means the check itself failed. dek reads, from each result:

| SARIF | dek's diagnostic |
| --- | --- |
| `ruleId` | `id`; it must be in `check.rules` |
| `message.text` | `message`; required |
| `locations[0].physicalLocation.artifactLocation.uri` | `path`: relative to the deck's folder, or a `file:` URL inside it or inside `pluginDir`. A location elsewhere is dropped. `slides/<slug>.html`, `.css`, or `.ts` also sets `slug` |
| `…region.startLine`, `…region.startColumn` | `line`, `column` |
| `properties.hint` | `hint`: what to do next |

dek makes each message and hint one line of at most 300 characters. The severity comes from the manifest. A finding in `pluginDir` that each deck's check reports the same way, such as a mistake in a project's data file, is reported once.

A check promises to print the same output for the same input, to write no file, and to use no network. dek gives it 30 seconds per deck, then stops it with SIGTERM and later SIGKILL, and runs it on no deck after one it hung on.

### Page API 1

A page runs after dek's player, in the dev server's player and in `dekc build`'s file, and touches one global:

```ts
import type { DekPage } from "@hajimism/dek/plugin";
declare const dek: DekPage;

dek.plugin("glossary", { api: 1 }, (api) => {
  api.deck;                 // { name }
  api.slides;               // [{ slug, title }]
  api.current();            // { slug, index, beat }, beat 0 being the slide's arrival
  api.on("change", (position) => {});            // at setup, then each time the deck settles
  api.on("mount", ({ slug, root, layer, view }) => {});
  api.shown(element);       // whether no beat still to come hides it
  api.data("glossary.yaml");   // { text, version } | null, for a file the manifest declares
  api.key("r", () => {});   // false for a key the manifest does not declare
});
```

- `mount` runs for every slide on the stage (`view` is `"stage"`), and again for a slide a live reload replaced. `root` is the slide: read it, never change it, since lint checked it as it is. `layer` is a ShadowRoot over the slide, in the slide's own pixels, that is the plugin's alone; only the current slide's shows, and its host takes no pointer, so give what you draw `pointer-events: auto` where it needs one.
- A layer measured on a slide that is not current is zero in size: measure on `change`.
- A page never reaches the presenter view, a video, or any page dek draws for a screenshot, PDF, pptx, or the visual lint.
- What a page throws is caught and named in the console, and the player goes on.
