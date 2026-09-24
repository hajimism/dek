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

From the project `theme.css`. A deck's own `theme.css` can differ; `dek theme` lists what a deck's theme defines.

- `card`
- `code`
- `code-title`
- `col`
- `figure`
- `hue-screen`
- `hue-script`
- `is-current`
- `is-shown`
- `kicker`
- `label`
- `lede`
- `meta`
- `note`
- `num`
- `slide`
- `slide-title`
- `stage`
- `stat`
- `tag`
- `tok-c`
- `tok-h`
- `tok-k`
- `tok-s`

## Theme tokens

- `--accent`
- `--bg`
- `--code-bg`
- `--code-dim`
- `--code-fg`
- `--code-screen`
- `--code-script`
- `--code-string`
- `--fg`
- `--font-body`
- `--font-mono`
- `--font-title`
- `--gap`
- `--hairline`
- `--line`
- `--line-strong`
- `--muted`
- `--pad`
- `--pad-bottom`
- `--pad-top`
- `--pad-x`
- `--page-transition`
- `--pin`
- `--radius`
- `--rule`
- `--screen`
- `--screen-soft`
- `--script`
- `--script-soft`
- `--shadow`
- `--size-body`
- `--size-caption`
- `--size-code`
- `--size-hero`
- `--size-lead`
- `--size-small`
- `--size-stat`
- `--size-title`
- `--step-transition`
- `--surface`
- `--surface-strong`
- `--tracking`

## Layouts

- `close`
- `default`
- `split`
- `title`

For a layout's markup, run `dek theme <layout>`.

For commands, run `dek help --agent`.
