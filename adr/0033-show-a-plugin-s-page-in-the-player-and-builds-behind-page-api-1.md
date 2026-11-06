# 33. Show a plugin's page in the player and builds behind page API 1

Date: 2026-11-06

## Status

Accepted

Amends [32. Let a plugin the user installed check a deck, and pin in the project what it promised](0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md)

## Context

A plugin can check a deck ([ADR 32](0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md)), but it cannot show anything to the person reading it. dekstudy, a study tool built on dek, needs exactly that. Its reader opens a deck they made days ago and lays a sheet over the words they want to recall, wherever they read it: in the dev server, in a built file, or on the site a build is published to. A plugin has no way into those pages.

What a plugin may do on a page has to be stated before it does anything:

- **Which pages it reaches.** dek draws stills, PDFs, slides for pptx, videos, and the visual lint's pages, and a plugin must never appear in any of them.
- **What it may touch.** A slide's markup is what lint checked and what an agent wrote. A plugin that changed it would make the page a reader sees differ from the deck that passed.
- **What it is told.** It needs where the deck stands, and when it got there, which the player has never said to anything outside itself.
- **How it is versioned.** Once the API is used it can only grow ([ADR 32](0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md)'s rule for the manifest and the check).

dekstudy's plan gated this on a four-week test of the sheet. Since the test needs the sheet, the PdM moved it first.

## Decision

**A manifest may declare a page:** `"page": { "api": 1, "keys": ["r"] }`.

- `api` is the version of the page API the page calls. A version this dek does not know makes the plugin unsupported, as a newer manifest schema or check protocol does.
- `keys` are single lowercase letters the page binds. A letter the player binds (`a`, `f`, `l`, `m`, `p`, `s`) is refused, and so is a letter named twice. A test reads the player's letters from the runtime, so the list cannot fall behind it.
- The lock pins `page` with the rest of the manifest. A page added, removed, or given other keys is a change the project accepts. AGENTS.md says which keys a plugin's page takes.

**This record decides how a page reaches a deck, not where its script comes from.** A pinned plugin whose lock declares `page` gets its page only when dek has a script for it to carry. No lock, or a lock without `page`, gets none. A plugin someone else wrote may declare a page, and dek pins the declaration, but nothing of theirs reaches a deck. Their script, and how a project vendors and checks it, are for a later record. The scripts dek carries are its own, so they are pinned by the project's lockfile as dek is.

**A plugin's page goes into two pages: the dev server's player, and `dekc build`'s file.**

- `renderDeckDocument` takes the plugins' pages as data and writes them only for a build or the dev player. Its callers find them, so it reads no file of a plugin's.
- The presenter view never carries one, nor does a video, a morph, or a motion shot, which also use `renderDeckDocument`.
- The still, PDF, pptx, and visual-lint pages are built without the player and know nothing of plugins.
- The dev player for a `--remote` audience carries the page, as the built file does.
- After the player, the page carries one JSON block of each plugin's keys and data, then each plugin's script, in name order.
- Text is written so that it cannot end its element.
- A data file's `version` is the first 16 hex digits of its SHA-256.

**Page API 1 is `window.dek.plugin(name, { api: 1 }, setup)`.** Its types are in `@hajimism/dek/plugin` as `DekPage`, `PageApi`, `PagePosition`, and `PageMount`. `setup` gets:

- `deck` (`{ name }`) and `slides` (`[{ slug, title }]`), and `current()`, which gives `{ slug, index, beat }`, where `beat` 0 is the slide's arrival.
- **`on("change", …)`.** It fires once at setup, then each time the deck settles at a position, beats included, whoever moved it. A move that another move is queued behind does not fire it.
- **`on("mount", …)`.** It fires for every slide on the stage, with `{ slug, root, layer, view: "stage" }`, and again for a slide a live reload replaced.
  - `root` is the slide, to read and never to change.
  - `layer` is a ShadowRoot that is the plugin's alone. Its host lies over the slide in `#deck`, beside the slides and never inside one, so it scales and moves with the slide and is captured with it in a view transition.
  - Only the current slide's layer shows, its host takes no pointer, and print hides every layer.
- **`shown(element)`:** whether no beat still to come hides it.
- **`data(path)`:** a data file the manifest declares, as `{ text, version }`, or null.
- **`key(letter, …)`:** binds a declared key. A letter another plugin bound first is refused, so the first plugin in name order keeps it.

A plugin that is not on the page, asks for another API, or throws in `setup` gets no layer and no keys, and the console names it. What a listener throws is caught and named. The player goes on in every case.

**The dev server reloads the page when a pinned plugin's lock or one of its data files changes.** A page reads its data once, as it loads.

**What was not chosen:**

- **Changing a slide's markup to hide words,** as a span around them would. The page would then differ from the deck lint passed, and a live reload would undo it.
- **A layer inside each `.slide`.** A theme's `:last-child` selectors and grid layouts would see it.
- **Mounting on the rail's thumbnails.** The rail draws copies of each slide, a ShadowRoot is not copied, and a closed rail measures nothing. Thumbnails still show what a layer covers. Adding `view: "thumb"` later adds a value a plugin already checks.
- **A Content-Security-Policy on built pages.** Nobody has checked that the player and every slide script make no request, and `connect-src 'none'` could break a slide that does. The pages dek carries are its own, and dek's review holds them to making none. A CSP comes once there is a third-party page to hold to it.
- **A data file kept out of `build --public`.** Every data file is public for now. A flag that keeps one out can be added later.
- **Writing a plugin's data from the page.** It needs the dev server to write a deck's file on a page's behalf. That is a later record.

## Consequences

- **The player has a public seam** that it did not have, and it grows only by adding. Its first users are to be dek's own plugins, written against the published types alone.
- **No deck carries a page yet.** This record gives the way in; the first page comes with the first plugin dek ships one for.
- **A slide's markup stays what lint checked.** Every plugin draws in a layer of its own.
- **The rail shows what a layer covers.** A reader who opens it sees the slide without the layer. It is listed above as the next thing for page API 1 to add.
- **Third-party pages, CSP, a data file kept out of `--public`, and data written from the page** are each a later record. None of them changes what this one decides.
