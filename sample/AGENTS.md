<!-- dek:begin (dek rewrites this block; write your own notes outside it) -->
# dek

A build system for talks. Write what you will say; dek builds, measures, and ships the rest.

## Principles

- `script.md` is the source of truth for order, script, and timing.
- Each slide is a `<section class="slide">` fragment.
- Conventions are enforced by lint; a deck is done when lint passes.

## Conventions

- One `##` heading is one slide. HTML lives in `slides/<id>.html`.
- Shared look lives in `theme.css`. Decoration only one slide uses lives in `slides/<id>.css`, which is scoped to that slide.
- Use only classes defined in `theme.css` or in that slide's own `slides/<id>.css`.
- Color, type, space, radius, and motion in either stylesheet use token `var()` only.
- Do not add `<style>`, `style=`, `<script>`, event handler attributes (`onclick=` and the like), or `javascript:` URLs inside slide HTML.
- Motion CSS cannot express lives in `slides/<id>.ts`: `export default { motion: { <step>: ms }, draw(slide, { index, step, t }) {} } satisfies DekSlide`. `DekSlide` is global, from `.dek/slide.d.ts`; do not import it. Draw from `t` alone and set everything you touch on every call, with no timers and no imports, so video and screenshots can seek it. In `draw`, find elements by data-* attributes, not classes.
- Keep the deck self-contained: no remote URLs and no paths outside the deck.

## Theme classes

From the project `theme.css`. A deck's own `theme.css` can differ; `dek theme` lists what a deck's theme defines.

- `chip`
- `code`
- `code-head`
- `col`
- `figure`
- `is-current`
- `is-shown`
- `label`
- `lede`
- `mark`
- `note`
- `numeral`
- `panel`
- `signal`
- `slide`
- `slide-title`
- `source`
- `stage`
- `stat`
- `tok-c`
- `tok-h`
- `tok-s`
- `unit`

## Theme tokens

- `--accent`
- `--accent-tint`
- `--bg`
- `--col`
- `--fg`
- `--font-body`
- `--font-mono`
- `--font-title`
- `--foot-rule`
- `--gap`
- `--grid-width`
- `--hair`
- `--head-rule`
- `--head-top`
- `--hi`
- `--line`
- `--line-soft`
- `--margin`
- `--muted`
- `--pad`
- `--paper-deep`
- `--radius`
- `--rise`
- `--rule`
- `--size-body`
- `--size-caption`
- `--size-code`
- `--size-hero`
- `--size-lede`
- `--size-numeral`
- `--size-small`
- `--size-stat`
- `--size-title`
- `--step-transition`
- `--tick`
- `--track`

## Layouts

- `cover`
- `default`
- `page`
- `split`
- `title`

For a layout's markup, run `dek theme <layout>`.

For commands, run `dek help --agent`.
<!-- dek:end -->
