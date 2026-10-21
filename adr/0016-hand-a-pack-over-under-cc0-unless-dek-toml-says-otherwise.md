# 16. Hand a pack over under CC0 unless dek.toml says otherwise

Date: 2026-10-21

## Status

Accepted

Amends [15. Hand a deck over as a pack and read it as a ref](0015-hand-a-deck-over-as-a-pack-and-read-it-as-a-ref.md)

## Context

[ADR 15](0015-hand-a-deck-over-as-a-pack-and-read-it-as-a-ref.md) has a pack carry its project's LICENSE file when the project has one at its root, and nothing otherwise. A pack with no license is read with the warning a repository with none gets: read it as a model, but ask its author before reusing its text or assets.

The first deck handed over as a pack showed what packs are for. It is a style guide: nineteen layouts with their example markup, a slide that fills in each one, and a script that says how to write the titles and message lines that go in them. It was made to be built on. Its reader takes its layouts, its theme, and its way of writing into decks of their own, and presents those decks to other people. Its project had no LICENSE file, as a project of talks usually does not, so every reader would be told to ask before reusing it, which is the one thing the deck exists to let them do.

The warning reached the wrong person. The reader cannot add a license to someone else's deck; the sender can, but `dekc pack` said nothing to them. And a sender who means to let readers build on a deck has to pick a license and find its text, at the moment they only meant to hand a file over.

## Decision

**`dek.toml` takes `[pack] license`, and a new project hands its decks over under CC0 1.0.** The key names the license `dekc pack` hands a deck over under: `"CC0-1.0"` or `"CC-BY-4.0"`. `dekc init` writes `"CC0-1.0"` into every new project's `dek.toml`, under a comment that says what it grants and how to change it:

```toml
[pack]
# The license `dekc pack` hands a deck over under. CC0-1.0 lets the reader reuse it
# freely, with no credit owed, as a template is meant to be used; CC-BY-4.0 asks for
# credit. Delete the line to hand decks over with no license.
license = "CC0-1.0"
```

CC0 1.0 is the default because a pack is used as a template, and it is the license that carries nothing into the decks built on one. CC BY 4.0 would have each of those decks credit the template, on slides shown in someone else's meeting; MIT would have its notice travel with every copy of `theme.css`. CC BY 4.0 stays one word away for an author who wants credit.

**The pack carries the license's legal code as `LICENSE`.** dek ships the two texts in `src/core/licenses/`, as Creative Commons publishes them; Creative Commons dedicates the text of its licenses to the public domain under CC0. `[pack] license` comes before the project's own LICENSE file, since it is the license for this act of handing over, and a project's LICENSE is often written for its code. Without the key, the pack carries that file as before.

**The sender is warned, not only the reader.** When a pack would carry no license, `dekc pack` says so, with the line to add to `dek.toml`, once per run: `warnings` in `--json`, after `outs`. The reader of a pack with no license is still warned as before.

**Any other value is refused** when `dek.toml` is read, with the two ids and a LICENSE at the project root as the way out. A misspelled key under `[pack]` is `DEK008`, as under `[voice]`.

**Only `dekc pack` reads it.** A ref on GitHub reads the repository's LICENSE file, as before, so the default `init` writes never speaks for a repository that is pushed in public.

**What was not chosen:**

- **A top-level `license`.** It reads as the repository's license, which GitHub refs never consult, so a default written by `init` would look like a grant made in public. `[pack]` names the one thing it does.
- **CC BY 4.0 or MIT as the default.** Each puts a condition into every deck built on the template.
- **No default.** The sender would still have to choose a license and find its text at the moment of handing a file over, and most would hand it over with none, which tells the reader not to do what the deck is for.

## Consequences

A deck packed in a project `dekc init` made goes out under CC0 1.0: its author gives up every right in it, credit included, toward anyone who receives the pack. The comment in `dek.toml` is what tells them so, and they may change it before they pack. A reader can build on it without asking and without crediting it.

Projects made before this, `sample/` among them, have no `[pack]`. They pack with their own LICENSE file, or with none and the warning that says how to add one.

`dekc pack --json` gains `warnings`, and `dek.toml` gains a key; the configuration reference lists it.
