# 11. Write the agent guidance as what the checks and commands do

Date: 2026-10-06

## Status

Accepted

## Context

A fresh agent built a deck from the guidance alone and found four places where that guidance said more, or less, than dek does.

- The AGENTS.md block said "Color, type, space, radius, and motion in either stylesheet use token `var()` only". DEK014 is narrower. It flags colors, font families, easings, and lengths and times in an absolute, viewport, container, or root unit. It passes keywords, unitless numbers, `%`, and font-relative units, so `letter-spacing: 0.1em`, `font-weight: bold`, and `border: thin solid` pass as they should. The agent could not tell whether the convention or the rule was wrong (criterion 2).
- `dekc init` writes a `theme.css` at the project root and one in the first deck, with the same contents. AGENTS.md said "Each deck owns its `theme.css`" and "Shared look lives in `theme.css`", and a hint that sent a fix "to `theme.css`" could mean either file. Lint, the build, and `dekc theme` read the deck's copy. The root's is only the template `dekc new` copies (criterion 1).
- `dekc show <slug>` said it prints the theme rules a slide uses. It kept every element and attribute rule under `.slide`, so a title slide with no list and no beats got `.slide ul` and `[data-step]` rules, with their keyframes and tokens. That is the kind of extra the excerpt was meant to leave out (criterion 1).
- `dekc shot <slug> --motion --json` returns an empty `shots` and puts its content under `motion` and `sheets`. Neither AGENTS.md nor the CLI reference said so (criterion 5).

## Decision

The guidance says what the code does. Where the code could decide more, it does.

- The AGENTS.md DEK014 line lists what DEK014 flags and what passes, and cites the rule id. It matches the DEK014 row in the lint reference.
- AGENTS.md names the deck's own `theme.css`, `decks/<deck>/theme.css`, as the file lint, the build, `dekc theme`, and every hint mean. It says the project root's copy is only the template `dekc new` copies, and that editing it changes no existing deck. `dekc init` still writes both files, as the project structure documents.
- `dekc show` passes the tags and attribute names in the slide's markup to the theme excerpt. A rule is left out when its selector needs an element or attribute that the markup lacks. Only what the selector requires outright counts: a name inside `:not()`, `:is()`, `:has()`, or any other parenthesis keeps the rule. So do the attributes the build stamps on every slide, `data-slug`, `style`, and `data-dek-*`. When the slide has `slides/<slug>.ts`, nothing is narrowed this way, because `draw` may add elements and attributes that the markup lacks. The `--json` shape is unchanged; the `theme` field's description says what it holds.
- AGENTS.md and the CLI reference say where `--motion` puts its results: `sheets` holds the sheets, `motion` holds each beat's frames, and `shots` is empty. The JSON schema describes the fields the same way. The shape is unchanged.

## Consequences

An agent can take the AGENTS.md block at its word. The DEK014 line and the rule agree, a hint about `theme.css` names one file, and `dekc show` prints rules the slide can match.

A slide whose markup gains an element or a `data-step` gets the matching rules back on its next `dekc show`. The excerpt still keeps a rule it cannot rule out, such as one behind `:is()` or one a slide script may reach, so it can still be longer than strictly needed, but it is no longer long in a way that misleads.

A test in `tests/core/tokens.test.ts` checks the values the DEK014 line names, so a change to DEK014 that falsifies that line fails a test.
