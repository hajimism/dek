# Themes

`theme.css` decides how a deck looks. Slides supply structure and class names; the theme supplies the shared look, and a slide's own `slides/<id>.css` adds decoration that only that slide uses. This page covers the token contract, how to grow a theme's vocabulary, and why each deck owns a copy.

## Thirteen tokens

If class names are the contract between HTML and theme, custom properties are the surface where appearance is swapped. Every theme publishes these thirteen tokens on `.slide`. They live on `.slide`, not `:root`, so they never leak into the presenter chrome. That is the same reason top-level selectors are forbidden (`DEK012`).

| Token | Role |
| --- | --- |
| `--fg` `--bg` `--accent` `--muted` | Color |
| `--font-title` `--font-body` | Type |
| `--size-title` `--size-body` `--size-caption` | Size |
| `--gap` `--pad` | Space |
| `--radius` | Corners |
| `--step-transition` | Motion |

Raw colors, `font-family` values, and absolute units may appear only when assigning a `--*` property. Everywhere else, use `var()` or `calc(var() …)`. Unitless `0`, `thin`, and `em` are allowed. A `var()` with a raw fallback, such as `var(--fg, #fff)`, counts as a raw value. A missing token is `DEK015`; a raw value outside a token is `DEK014`. You may add as many deck-specific tokens as you like.

Every selector must sit under `.slide`. `::view-transition-*` pseudo-elements and at-rules such as `@keyframes` and `@media` are the only exceptions.

## Growing the vocabulary

A class the theme does not define is `DEK010`. You clear it by adding the class to `theme.css`. That is intentional: extending the vocabulary is a design decision, and lint should not forbid it. Lint's job is to make the decision cost one deliberate step and to leave a reviewable diff. `DEK013` caps the total class count (40 by default) so that step is not repeated forever.

New classes land in the deck's own `theme.css`, so no other deck is affected. When a class earns its place, lift it into the project theme with `cp`.

Not every class deserves that step. Decoration that one slide uses goes in that slide's own stylesheet instead, where it neither counts toward `DEK013` nor leaks into other slides. See [Slide stylesheets](./slides#slide-stylesheets).

## Copy, then freeze

The project's `theme.css` is the starting point for new decks. Edits flow in one direction: down into a new deck on creation, and back up by hand when you decide something is worth keeping.

```bash
dek new 2026-09-dek
dek new 2026-09-dek --theme-from 2026-04-vite
cp decks/2026-09-dek/theme.css theme.css
```

The reasoning is in [Projects and Decks](./structure#themes-are-copied-not-shared).

## Next

Turn conventions into a loop you cannot forget: [Lint](./lint).
