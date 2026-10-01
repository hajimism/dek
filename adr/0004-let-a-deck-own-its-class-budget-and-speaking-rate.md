# 4. Let a deck own its class budget and speaking rate

Date: 2026-10-02

## Status

Accepted

## Context

`max_classes`, `cjk_per_minute`, and `latin_per_minute` were read from `dek.toml`, so they applied to every deck in a project at once. A deck already owns its `theme.css` and its `[voice]`, and a talk given in April is not rewritten in September: tightening `max_classes` in September failed April's finished deck.

## Decision

The three keys move into each deck's `script.md` frontmatter (8dc9a07). `dek.toml` only seeds them: `dekc new` copies what it sets into the new deck, and after that the deck's own value is the one that applies.

A deck that leaves out a key `dek.toml` sets to something other than the default gets a `DEK008` warning whose hint names the line to add.

## Consequences

Changing a project's defaults no longer changes decks that already exist, and a deck reads the same wherever it is copied.

This was a breaking change: an existing deck that relied on `dek.toml` for these keys falls back to the defaults until the keys are added to its frontmatter, which `DEK008` points out one by one.
