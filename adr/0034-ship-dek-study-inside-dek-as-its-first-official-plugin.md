# 34. Ship dek-study inside dek as its first official plugin

Date: 2026-11-06

## Status

Accepted

Amends [32. Let a plugin the user installed check a deck, and pin in the project what it promised](0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md)

## Context

dekstudy is a study tool built on dek. A reader of a study deck puts stickers over the words they should be able to recall, then lifts them one at a time. The stickers live beside the deck, in `study.yaml`, and the first thing they need is a check: an edit to a slide must not leave a sticker pointing at words that are gone, or hiding a word that still shows elsewhere on the slide. [ADR 32](0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md) lets a plugin run that check in `dekc lint`.

A plugin under ADR 32 is an executable the user installs on `PATH`. Set beside the plugin systems that inform ADR 32, that install leaves a plugin worse off than the best of them:

- **Nothing installs what the lock pins.** `terraform init`, `mise install`, and lazy.nvim's restore each install exactly what a project's lock names.
- **The lock pins the promise, not the code.** An update that keeps the manifest and changes the code runs without anyone accepting it. Terraform's lock holds each platform's hashes and would refuse it.
- **Windows is unknown.** dek takes only an `.exe` there, and nobody has checked what a package manager's global install puts on `PATH`.

The plugin dek's own maintainers write does not have to live with any of that.

## Decision

**dek ships its official plugins in its own package, and `study` is the first.** Its code is in `src/plugins/study/`, and `main.ts` answers `manifest` and `check --protocol 1` as ADR 32 says any plugin does. A project uses it the way it uses any plugin: `[plugins.study]` in `dek.toml`, `dekc sync` to pin it, `dekc lint` to run it. Nothing is installed. The official name is dek-study, as SARIF's run and every message call it.

**dek runs an official plugin from its own files, never from `PATH`.** When dek resolves a plugin's name, a name it ships comes first, and its `main.ts` runs in a bun of its own, with the flags every bun dek starts gets: no auto install, no `.env`, and no `bunfig.toml`. A `dek-study` on `PATH` is passed over. The name `study` is reserved: `[plugins.study]` always runs dek's own, so a third-party plugin cannot take it. (`dek` and `md` are refused as names outright, by ADR 32.)

**What a project pins covers the code too.** The plugin's code is the dek the project installed, which the project's own lockfile pins, hash included. The manifest's lock in `plugins/study/plugin.json` still pins what it promises, as for any plugin.

**An official plugin keeps the boundary of any other.** It runs in a process of its own, and it imports nothing of dek's but the types in `src/plugin-api.ts`, the ones `@hajimism/dek/plugin` publishes; a test reads its imports to hold it there. It is written against the contract a third-party plugin gets, so it shows that contract is enough, and it could move to a package of its own without a change.

**An official plugin has a version of its own.** dek-study is 0.1.0, apart from dek's. A dek release that leaves the plugin's rules as they were changes nothing a project has to accept. A release that changes them changes the version, and `dekc sync` shows what changed until the project accepts it.

**dek-study checks `study.yaml` in a deck's folder:**

```yaml
version: 1
stickers:
  - id: s_8k2f                 # unique in the deck
    slide: planning-fallacy    # the slide's slug
    quote: 外部視点             # the words the sticker hides
    prefix: 楽観的に見積もる傾向に、  # optional: the words right before, to tell two places apart
```

- **Words:** a slide's words are the text a reader sees in its HTML, in document order, without `script`, `style`, `template`, `noscript`, or comments. Character references are read as characters, and each run of whitespace is one space.
- **Where a sticker sits:** in a script written with spaces between words (Latin, Greek, Cyrillic, and digits), a quote is whole words, so `is` is not found in "This". In Japanese, Chinese, Korean, and Thai it is any run of the words. A sticker with a `prefix` takes the first place its quote follows that prefix. One without takes the first place left.
- **`STUDY001`, error:** a sticker's words are not on its slide, or its slide is not in the deck. When they are gone from it and its quote and prefix place on exactly one other slide, the hint names that slide as the sticker's `slide`. When they are still on it, the message says whether the prefix no longer matches or the stickers before it took every place, and names no other slide.
- **`STUDY002`, warning:** a sticker's words show again on its slide where no sticker covers them. A word can be meant twice, so it does not fail lint.
- **`STUDY003`, error:** `study.yaml` does not read. It is not YAML, its `version` is not 1, a sticker lacks an `id`, `slide`, or `quote`, one of its words is a value YAML reads as a number or as true or false (the message says to quote it), or two stickers share an id. A sticker that does not read is left out, and the rest are checked. A plugin that exits non-zero is `DEK046`, a fault of the plugin's, so a mistake in the deck's own file is a finding instead.
- **A deck with no `study.yaml`** has nothing to check.

Each finding's path is `study.yaml`, at the sticker's line, since that is the file an agent changes.

**dek-study's page is the sheet,** through page API 1 ([ADR 33](0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md)). dek compiles `src/plugins/<name>/page.ts` of each plugin it ships for the browser when it starts a dev server or a build, as it compiles the player, and those are the scripts ADR 33 lets it carry. dek-study's manifest declares `page` with the key `r`.

- **`r`** lays the sheet on or takes it off, and a short notice in the corner, SHEET ON or SHEET OFF, says which, fading in and out. The sheet starts off, and each browser remembers its state for the deck.
- **A sticker** covers its words, one box per line, wherever the words cross elements. A sticker over a beat still to come is not drawn.
- **A sticker is a slip of pale yellow paper,** as a sticky note is, with square corners and a deeper yellow foot, the same on every theme. It reads as something laid on the slide, not part of it. Its width says how long the words are, and nothing else shows.
- **The pointer on a sticker peels it away at once:** it fades out over 180 ms and leaves its yellow foot under the words, so the place still reads as a sticker's. When the pointer leaves, it fades back in over 120 ms. Every line of a sticker peels together. The fades are CSS transitions, which the player's hurry may cut short, harmlessly. A reader who asks the system for reduced motion gets no fades.
- **The words it looks for** are found with the same YAML reader and the same placement as the check. That reader handles the YAML study.yaml is written in, refusing anything else as `STUDY003`, so a deck that passes lint is a deck the sheet covers.

**What was not chosen:**

- **A package of its own, found beside dek's install as rumdl is.** It would let the plugin release apart from dek. It would also need `bun add -d` in every project, and release-please and npm trusted publishing set up for two packages ([ADR 3](0003-release-through-release-please-and-npm-trusted-publishing.md)). dekstudy is an experiment with a four-week test. Moving it out later costs a release; carrying a second release pipeline from the start costs every release.
- **A package of its own, installed globally.** Every gap listed above would stay.
- **The study features in dek itself.** A sheet over a deck and its stickers are a study tool's, not a talk's. As a plugin, it is opt-in, it cannot reach dek's internals, and a project that does not name it is unchanged.

## Consequences

- **A project that wants dek-study writes one line.** `[plugins.study]`, then `dekc sync`: no install, no `PATH`, the same on every platform dek runs on.
- **dek's package carries dek-study's code**, a few hundred lines, whether or not a project uses it. Removing it later is a breaking change for the projects that name it, decided as one.
- **dek-study's tests run in dek's CI.** A change to the plugin contract that breaks dek-study fails there first, which keeps the contract honest.
- **The name `study` is taken.** A user's own `dek-study` on `PATH` never runs.
- **Third-party plugins keep ADR 32's install,** with its gaps. Which one to close first is decided when there is a third-party plugin to close it for: pinning with mise, an install command, or code hashes in the lock.
- **A project with `[plugins.study]`, after `dekc sync`, has the sheet** in the dev server and in every build. The stickers come from `study.yaml`, written by the agent that made the deck or by hand.
- **The rail shows the words the sheet hides,** until page API 1 mounts on thumbnails.
- **Writing stickers from the page** waits for a record that lets the dev server write a plugin's data.
