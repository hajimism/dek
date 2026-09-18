# dek

Talk-script-first HTML slides.

## Principles

- `script.md` is the source of truth for order, script, and timing.
- Each slide is a self-contained HTML document.
- Conventions are enforced by lint; a deck is done when lint passes.

## Conventions

- One `##` heading is one slide. HTML lives in `slides/<id>.html`.
- Use only classes defined in this deck's `theme.css`.
- Color, type, space, radius, and motion in `theme.css` use token `var()` only.
- Do not add `<style>`, `style=`, or `<script>` to slides.
- Keep the deck self-contained: no remote URLs and no paths outside the deck.

## Theme classes

- `col`
- `figure`
- `figure-small`
- `is-current`
- `is-shown`
- `node`
- `node-parent`
- `slide`
- `slide-title`

## Theme tokens

- `--accent`
- `--bg`
- `--fg`
- `--font-body`
- `--font-title`
- `--gap`
- `--muted`
- `--pad`
- `--radius`
- `--size-body`
- `--size-caption`
- `--size-title`
- `--step-transition`

## Layouts

- `default`
- `full-bleed`
- `quote`
- `title`
- `two-col`

For commands, run `dek help --agent`.
