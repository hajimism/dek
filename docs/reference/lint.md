# Lint Rules

How lint fits the workflow is in [Lint](/guide/lint). This page is the table of ids and conditions.

| ID | Condition | `--fix` |
| --- | --- | --- |
| `DEK001` | A section in `script.md` has no HTML in `slides/` | Creates the skeleton |
| `DEK002` | An HTML file, stylesheet, or script (`.ts`) in `slides/` has no section in `script.md` | — |
| `DEK003` | A `data-step` is neither a beat id nor a valid position on its slide | — |
| `DEK004` | A section id is repeated in the deck, or a beat id is repeated in its section | — |
| `DEK005` | A `data-morph` name is repeated on one slide | — |
| `DEK006` | `data-slug` does not match the section id | — |
| `DEK010` | A class that neither the theme nor the slide's own stylesheet defines | — |
| `DEK011` | `<style>`, `style=`, or `<script>` inside a slide | — |
| `DEK012` | A top-level selector in the theme, or a rule in a slide stylesheet that reaches past the slide (`::view-transition-*`, `@font-face`, `@import`, `:root`, `html`, `body`) | — |
| `DEK013` | The theme defines more classes than `max_classes` (default 40) | — |
| `DEK014` | A raw color, `font-family`, or absolute unit outside a token assignment, in the theme or a slide stylesheet | — |
| `DEK015` | A required token is missing from `.slide` | — |
| `DEK016` | A slide script that cannot run: an import, a named export, no default export, a syntax error, top-level await or code that throws, a `motion` key that is not a beat of the slide, top-level code that does not finish, or a script saved as `.js` instead of `.ts` | — |
| `DEK020` | A remote URL (CDN, remote image) | — |
| `DEK021` | A referenced image file does not exist | — |
| `DEK022` | A path that leaves the deck directory | — |
| `DEK023` | A local `src`, or a `url()` in a slide stylesheet, that does not start with `assets/` | — |
| `DEK030` | Content overflows the slide when rendered, at any beat | — |
| `DEK031` | Contrast below 4.5:1, or below 3:1 for WCAG large text (24px+, or 18.66px+ bold) | — |
| `DEK040` | An ASCII word missing from the pronunciation dictionary. Warning | — |
| `DEK041` | Narrated length far from the `duration` budget. Warning | — |
| `DEK042` | A beat with visible content (list, code, table) but no spoken paragraph. Warning | — |
| `DEK043` | A `[beats]` key in `voice.toml` that matches no slide or beat. Warning | — |

## Conditions

- `DEK030` and `DEK031` run only with `--visual` and require Playwright.
- `DEK040`, `DEK042`, and `DEK043` apply only to decks with `voice/`. `dek cues` reports `DEK042` regardless.
- `DEK041` applies only to decks with a Timeline.
- `DEK040` through `DEK043` are warnings. A live-only deck's definition of done is unchanged.

## Notes

### DEK001 / DEK002

`--fix` creates the skeleton and never touches an existing file. Exactly one of each suggests a rename, and lint proposes `dek mv <old> <new>`. More than one of either and it does not guess.

### DEK003

An unresolvable reference. A beat with no element is fine, and positions need not be consecutive.

### DEK005

A `data-morph` name must be unique within a slide, because it becomes a `view-transition-name` and the browser needs exactly one element on each side of the transition. The same name on two different slides is the intended use.

### DEK010

Clear it by defining the class in `theme.css`, or in `slides/<id>.css` when only that slide uses it. Growing the shared vocabulary is a design decision; lint makes it one visible step. `DEK013` caps how often that step can be repeated, and slide stylesheets do not count toward it.

### DEK014 / DEK015

Raw values are allowed only when assigning a `--*` property. Unitless `0`, `thin`, and `em` pass. `var()` with a raw fallback does not. All thirteen tokens in the contract must be published on `.slide`; extra tokens are welcome.

### DEK020 / DEK021 / DEK022 / DEK023

Self-containment. Nothing remote, nothing from the project root, nothing from a sibling deck. Local `src` values start with `assets/`. This is what allows `dek build` to inline every asset and the project-root dev server to serve them.

### DEK031

Thresholds follow WCAG AA: 4.5:1 for body text, 3:1 for large text. Large text is a computed `font-size` of 24px or more, or 18.66px or more at `font-weight` 700 or above. A big number in a soft color passes; the same color on body text fails. The thresholds are not configurable.

### DEK042

Only paragraphs are spoken. A beat that shows a list, code, or a table without a paragraph passes in `pause.beat` milliseconds when narrated. Empty beats and blockquote-only beats are treated as deliberate pauses and are not flagged.
