# dek

Talk-script-first HTML slides.

## Principles

- `script.md` is the source of truth for order, script, and timing.
- Each slide is a `<section class="slide">` fragment.
- Conventions are enforced by lint; a deck is done when lint passes.

## Conventions

- One `##` heading is one slide. HTML lives in `slides/<id>.html`.
- Shared look lives in `theme.css`. Decoration only one slide uses lives in `slides/<id>.css`, which is scoped to that slide.
- Use only classes defined in `theme.css` or in that slide's own `slides/<id>.css`.
- Color, type, space, radius, and motion in either stylesheet use token `var()` only.
- Do not add `<style>`, `style=`, or `<script>` inside slide HTML.
- Motion CSS cannot express lives in `slides/<id>.ts`: `export default { motion: { <step>: ms }, draw(slide, { index, step, t }) {} } satisfies DekSlide`. `DekSlide` is global, from `.dek/slide.d.ts`; do not import it. Draw from `t` alone and set everything you touch on every call, with no timers and no imports, so video and screenshots can seek it. In `draw`, find elements by data-* attributes, not classes.
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
