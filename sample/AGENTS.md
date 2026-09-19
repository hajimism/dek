# dek

Talk-script-first HTML slides.

## Principles

- `script.md` is the source of truth for order, script, and timing.
- Each slide is a `<section class="slide">` fragment.
- Conventions are enforced by lint; a deck is done when lint passes.

## Conventions

- One `##` heading is one slide. HTML lives in `slides/<id>.html`.
- Use only classes defined in this deck's `theme.css`.
- Color, type, space, radius, and motion in `theme.css` use token `var()` only.
- Do not add `<style>`, `style=`, or `<script>` to slides.
- Keep the deck self-contained: no remote URLs and no paths outside the deck.

## Theme classes

- `claim`
- `col`
- `exhibit`
- `figure`
- `figure-small`
- `flow`
- `icon`
- `is-current`
- `is-shown`
- `kicker`
- `lede`
- `mark`
- `meta`
- `node`
- `node-parent`
- `note`
- `num`
- `slide`
- `slide-title`
- `stack`
- `stat`

## Theme tokens

- `--accent`
- `--bg`
- `--brand`
- `--brand-soft`
- `--canvas`
- `--fg`
- `--font-body`
- `--font-title`
- `--gap`
- `--hairline`
- `--icon`
- `--icon-lg`
- `--line`
- `--muted`
- `--pad`
- `--pad-x`
- `--pad-y`
- `--radius`
- `--rail`
- `--size-body`
- `--size-caption`
- `--size-stat`
- `--size-title`
- `--step-transition`
- `--surface`
- `--surface-strong`
- `--tracking`

## Layouts

- `close`
- `default`
- `full-bleed`
- `pipeline`
- `process`
- `quote`
- `split`
- `title`
- `tree`
- `two-col`

For commands, run `dek help --agent`.
