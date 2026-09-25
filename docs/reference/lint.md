# Lint Rules

How lint fits the workflow is in [Lint](/guide/lint). This page is the table of ids and conditions.

| ID | Condition | `--fix` |
| --- | --- | --- |
| `DEK001` | A section in `script.md` has no HTML in `slides/` | Creates the skeleton |
| `DEK002` | An HTML file, stylesheet, or script (`.ts`) in `slides/` has no section in `script.md` | — |
| `DEK003` | A `data-step` is neither a beat id nor a valid position on its slide | — |
| `DEK004` | A section id is repeated in the deck, or a beat id is repeated in its section | — |
| `DEK005` | A `data-morph` name is repeated on one slide, or is reserved (`slide`, `root`, `none`, `auto`, `match-element`) | — |
| `DEK006` | `data-slug` does not match the section id | — |
| `DEK007` | A file in `slides/` has no `<section class="slide">`, so it draws nothing | — |
| `DEK008` | A key in `dek.toml` or the frontmatter that dek does not read. The hint names the key it most likely meant. Warning | — |
| `DEK009` | A file in `slides/` holds more than one `<section class="slide">`; only the first is shown | — |
| `DEK010` | A class that neither the theme nor the slide's own stylesheet defines | — |
| `DEK011` | `<style>`, `style=`, `<script>`, an event handler attribute (`onclick=` and the like), or a `javascript:` URL inside a slide | — |
| `DEK012` | A top-level selector in the theme, or a rule in a slide stylesheet that reaches past the slide (`::view-transition-*`, `@font-face`, `@import`, `:root`, `html`, `body`) | — |
| `DEK013` | The theme defines more classes than `max_classes` (default 40) | — |
| `DEK014` | A raw color, `font-family`, or absolute unit outside a token assignment, in the theme or a slide stylesheet | — |
| `DEK015` | A required token is missing from `.slide` | — |
| `DEK016` | A slide script that cannot run: an import, a named export, no default export or one that is not an object, a `draw` that is not a function, a syntax error, top-level await or code that throws, a `motion` key that is not a beat of the slide or a value that is not a non-negative number of milliseconds, top-level code that does not finish, or a script saved as `.js` instead of `.ts` | — |
| `DEK017` | A slide script that would not draw the same frame for the same `t`: a timer, `requestAnimationFrame`, `Date`, `performance.now`, or `Math.random`; or a class used to find an element (`querySelector`, `closest`, `matches`, `getElementsByClassName`) | — |
| `DEK018` | The deck has no `theme.css`, so it shows unstyled and the theme rules cannot run | — |
| `DEK019` | A `data-layout` that neither the theme nor the slide's own stylesheet defines. Checked when the theme defines at least one layout | — |
| `DEK020` | A remote URL (CDN, remote image), in any attribute that names a URL or in a slide stylesheet's `url()` | — |
| `DEK021` | A file the slide loads does not exist: an image, a `srcset` candidate, a video, audio, track, poster, frame, or object, or a `url()` in a slide stylesheet. When the project's `assets/` has it, the hint says to copy it into the deck | — |
| `DEK022` | A path that leaves the deck directory | — |
| `DEK023` | A local file the slide loads (`src`, `srcset`, `poster`, …, or a `url()` in a slide stylesheet) that does not start with `assets/` | — |
| `DEK024` | A heading with nothing to read: no text, no image, no `aria-label`. An id-only `##` heading after the first slide makes one. Warning | — |
| `DEK030` | An element or its text runs past an edge of the slide when rendered, at any beat | — |
| `DEK031` | Contrast below 4.5:1, or below 3:1 for WCAG large text (24px+, or 18.66px+ bold) | — |
| `DEK040` | An ASCII word missing from the pronunciation dictionary. Warning | — |
| `DEK041` | The talk's length far from the `duration` budget: narrated length with a Timeline, the reading-time estimate without. Warning | — |
| `DEK042` | A beat with visible content (list, code, table) but no spoken paragraph. Warning | — |
| `DEK043` | A `[beats]` key in `voice.toml` that matches no slide or beat. Warning | — |
| `DEK044` | A `#` or `####` heading in `script.md`. Only `##` (slide) and `###` (beat) mean anything, so any other level is read out as script. Warning | — |

## Conditions

- `DEK030` and `DEK031` run only with `--visual` and require Playwright. They measure each beat as it ends, with every animation and transition run to its end; see [What a still shows](/guide/steps#what-a-still-shows).
- `DEK040`, `DEK042`, and `DEK043` apply only to decks with `voice/`; `DEK044` applies to every deck. `dek cues` reports `DEK042` regardless.
- `DEK041` applies to decks with a `duration`. With a Timeline it measures the narration (20% margin); without one it uses the reading-time estimate (35% margin). `data` carries `actualSeconds`, `budgetSeconds`, and `source` (`timeline` or `estimate`).
- `DEK008`, `DEK024`, and `DEK040` through `DEK044` are warnings: reported with `"severity": "warning"`, and they do not fail lint. Every other rule is an error. A live-only deck's definition of done is unchanged.
- `DEK008` for `dek.toml` is a project finding; `dek lint` and `dek build` report it once, however many decks they cover.

## Notes

### DEK001 / DEK002

`DEK001` points at the section heading in `script.md`; `data.expected` is the HTML path it looked for. `--fix` syncs first: it creates the skeleton, removes an orphan that is still an untouched skeleton with nothing beside it, and never touches a slide you have edited, so a `DEK002` that remains is a file with your work in it. One orphan and one section without its own HTML (missing, or still the generated skeleton) suggest a rename: both diagnostics carry `` run `dek mv <old> <new>` `` as the hint, and the command works whether or not `script.md` was edited first. More than one candidate and lint does not guess.

### DEK003

An unresolvable reference. A beat with no element is fine, and positions need not be consecutive. The hint lists the ids and positions the slide can use.

### DEK005

A `data-morph` name must be unique within a slide, because it becomes a `view-transition-name` and the browser needs exactly one element on each side of the transition. The same name on two different slides is the intended use.

Some names are taken. The player names the slide box `slide`, and the browser names the page `root`; a morph with either name would collide with the page change itself. `none`, `auto`, and `match-element` are keywords of `view-transition-name`, so the element would not morph at all.

### DEK010

Clear it by defining the class in `theme.css`, or in `slides/<id>.css` when only that slide uses it. Growing the shared vocabulary is a design decision; lint makes it one visible step. `DEK013` caps how often that step can be repeated, and slide stylesheets do not count toward it. The hint lists the classes already defined. If the class is only there for `slides/<id>.ts` to find an element, use a `data-*` attribute instead.

### DEK014 / DEK015

The hint names the theme tokens that could take the value's place: color tokens for a color, `--size-*` for a `font-size`, and so on. When none fits, it says to add one to `theme.css`.

Raw values are allowed only when assigning a `--*` property. Unitless `0`, `thin`, and `em` pass. `var()` with a raw fallback does not. All thirteen tokens in the contract must be published on `.slide`; extra tokens are welcome.

### DEK011

Each occurrence is its own diagnostic, at its line and column, so one run lists every inline style and script. `data` says what was found: `{ "kind": "element", "name": "style" }`, or `{ "kind": "attribute", "name": "onclick", "value": "go()" }` for an attribute. A slide takes no input, so an event handler has nowhere to move; motion goes in `slides/<id>.ts`.

### DEK016 / DEK017

`DEK016` means the script cannot run; `DEK017` means it runs but depends on something other than `t`, or finds elements by a class the theme may rename. Both point at the script file, and `DEK017` at the line. A script with an import is still evaluated with the import removed, so its `motion` keys are checked in the same run.

### DEK020 / DEK021 / DEK022 / DEK023

Self-containment. Nothing remote, nothing from the project root, nothing from a sibling deck. Local files start with `assets/`.

One table decides which attributes name a URL and what the page does with it. A resource is loaded to draw the slide: `src`, each `srcset` candidate, `poster`, `data` on `<object>`, and `href` on SVG `<image>` and `<use>`. A resource must exist (`DEK021`) and be written as `assets/...` (`DEK023`). A link is only followed: `href` on `<a>`, `<area>`, and `<link>`. A link must still be local and inside the deck (`DEK020`, `DEK022`). Every URL is reported at its own line and column. A symlink is judged by where it leads: one in `assets/` that points out of the deck is `DEK022`, and neither the build nor the dev server reads it. This is what allows `dek build` to inline every asset and the project-root dev server to serve them.

### DEK024

`dek sync` never puts a section id on a slide, so a `##` heading that is only an id (`## architecture`) gets an empty `<h2 class="slide-title">` in its skeleton, unless it is the first slide, which takes the deck title. While the file is still that skeleton, the hint says to give the heading a title in `script.md`, like `## Architecture {#architecture}`, and run `dek sync`, which rewrites the skeleton; the id and file name stay. Once the slide is edited, the hint says to write the heading's text or remove the element. It is a warning because a slide script may fill the heading as the slide draws.

### DEK030

The hint keeps the fix on the slide: cut or split the content, or size it in `slides/<id>.css`. It never suggests changing a theme token, which would move every slide.

The message names the element, the start of its text, the edge, and how many pixels it runs past. A child is reported only for an edge its parent stays inside, so a list that runs off the bottom is one finding. The same finding on several beats is one diagnostic that names every beat. Text is measured as well as boxes, so an unbreakable string such as a URL counts even when its box fits.

### DEK031

Thresholds follow WCAG AA: 4.5:1 for body text, 3:1 for large text. Large text is a computed `font-size` of 24px or more, or 18.66px or more at `font-weight` 700 or above. A big number in a soft color passes; the same color on body text fails. The thresholds are not configurable. The message names the element, its text, and both colors.

Contrast is measured from pixels, not from styles. Each beat is drawn with its text as shown, with every glyph transparent, and with every glyph filled white and then black. The white and black drawings show where the glyphs are, whatever their color; within them, each pixel of the text is compared with the pixel it sits on. Gradients, background images, glows, overlapping elements, opacity, and colors in any syntax are measured as drawn.

Only the pixels a text's glyphs cover most are read, each taken back to the color a glyph covering the whole pixel would draw, so antialiasing never lowers a ratio and a thin hyphen reads at its own color. The ratio reported is the one all but the worst 2% of those pixels reach: text over a gradient is judged by the part that reads worst. `fg` and `bg` are the two colors at that pixel. Where two texts overlap, neither is judged by the shared pixels unless it has no others. What `::before` and `::after` draw counts as background, and `DEK030` does not measure it.

### DEK042

Only paragraphs are spoken. A beat that shows a list, code, or a table without a paragraph passes in `pause.beat` milliseconds when narrated. Empty beats and blockquote-only beats are treated as deliberate pauses and are not flagged.
