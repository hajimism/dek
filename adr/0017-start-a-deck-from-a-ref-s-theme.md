# 17. Start a deck from a ref's theme

Date: 2026-10-21

## Status

Accepted

## Context

A ref is someone else's deck, pinned to read as a model. Every command but `ls`, `show`, `theme`, and `shot` refuses one, `dekc new --theme-from` among them, and AGENTS.md tells the agent to read a ref's slide and then write its own in its own deck's theme. That fits a ref read for how its slides are built: the agent learns the shape, and lint catches any class or token it carried over by mistake.

It does not fit a ref made to be built on. The deck that brought this up is a style guide, handed over as a pack ([ADR 15](0015-hand-a-deck-over-as-a-pack-and-read-it-as-a-ref.md)): nineteen layouts, each with its example markup in `theme.css`, a slide that fills in each one, and a script that says how to write the titles and message lines that go in them. Its own last slides tell the reader to pin it as a ref and pull a layout's markup with `dekc theme <ref> <layout>`. Asked to make a deck in that style, an agent can read all of it. But the markup it pulls uses the ref's layouts and classes, which its own deck's theme does not have, so lint refuses every one: `DEK019` for the layout and `DEK010` for each class. The only way through was to copy the `theme.css` inside the ref's snapshot under `refs/` into the deck by hand, a step no command and no guidance names, and one AGENTS.md steers the agent away from.

A theme is the one part of a deck that is meant to be copied whole. `dekc new --theme-from <deck>` already starts a deck from another of the project's decks, and every deck owns its copy from then on.

## Decision

**`dekc new <name> --theme-from <ref>` starts a deck on a ref's theme.** `--theme-from` takes a ref name, `owner/repo/deck`, a pack's `file/<deck>`, or a GitHub link, as well as a deck of the project. The ref must be pinned; a snapshot that is missing or not at the pin is fetched, or unpacked from its pack, first, as for the commands that read a ref. The new deck gets a copy of the ref's `theme.css` and nothing else of it: no slide, no asset, no script. The ref stays read-only; only the copy is the new deck's.

**The copy says where it came from.** Its first line is a comment, `/* Theme from the ref <name> at <short rev>. */`, above the theme as the ref has it. The agent reading the theme, and the author returning to it a year later, can tell where it came from, and a license that asks for credit has the credit written down where the theme travels. A theme copied from one of the project's own decks gets no such line, as before.

**A ref with no license is copied with a warning.** `--json` returns `warnings`, empty unless the ref has no license file, when it says to ask the ref's author before presenting or sharing a deck built on its theme, in the voice of the warning `dekc ref` gives.

**The guidance names it first.** AGENTS.md's References section still says refs are read-only, then names the two ways to use one, in this order: a deck built on a ref's layouts starts with `dekc new <name> --theme-from <ref>`; otherwise the agent reads a slide with `dekc show <ref> <slug>` and writes its own in its deck's theme. The order is the point: an agent asked for a deck in a ref's style that meets the second way first rebuilds the ref's layouts in its own theme. The error a command gives when handed a ref names the two ways in the same order.

## Consequences

An agent asked for a deck in a ref's style starts it with one command, and the layouts and classes it pulls with `dekc theme <ref> <layout>` pass lint in that deck, because they are its theme's now. Lint still catches a class carried over from any other ref.

A deck started this way is as self-contained as any other: it refers to nothing outside itself, and later changes to the ref, or dropping it, leave the copy as it was. Taking up the ref's later changes is done by hand, as for a theme copied from one of the project's decks.

`dekc new --json` gains `warnings`. The skill names `dekc new` already, so nothing in it changes.

A deck can now take a theme its project never saw. What its author may do with it is the ref's license; dek warns when there is none and otherwise leaves the reading of it to them.
