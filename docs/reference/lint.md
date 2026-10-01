# Lint Rules

How lint fits the workflow is in [Lint](/guide/lint). This page is the table of ids, scopes, and conditions.

## Scope

Each finding is about one of three things, and the command that reports it follows from that:

- **`slide`**: one slide's files, or its section in `script.md`. The finding carries that slide's `slug`. `dek check <slug>` reports these, and only for that slide.
- **`deck`**: a file every slide of the deck shares: `theme.css`, the frontmatter, `voice/voice.toml`, or `script.md` as a whole (its length, a heading above the first slide). It carries no `slug`.
- **`project`**: `dek.toml`. Found once per project, however many decks a command covers.

`dek lint` reports all three. A rule that reads both a shared file and a slide's own has two scopes: `DEK014` in `theme.css` is a deck finding, in `slides/<id>.css` a slide finding. `dek build` and `dek ls` count the same findings as `dek lint` without rumdl, whose Markdown style checks run only in `dek lint`; `dek ls` lists a project finding on its own `project` line, not on each deck's row.

## Rules

| ID | Scope | Condition | `--fix` |
| --- | --- | --- | --- |
| `DEK001` | `slide` | A section in `script.md` has no HTML in `slides/` | Creates the skeleton |
| `DEK002` | `slide` | An HTML file, stylesheet, or script (`.ts`) in `slides/` has no section in `script.md` | — |
| `DEK003` | `slide` | A `data-step` is neither a beat id nor a valid position on its slide | — |
| `DEK004` | `slide` | A section id is repeated in the deck, or a beat id is repeated in its section | — |
| `DEK005` | `slide` | A `data-morph` name is repeated on one slide, or is reserved (`slide`, `root`, `none`, `auto`, `match-element`) | — |
| `DEK006` | `slide` | `data-slug` does not match the section id | — |
| `DEK007` | `slide` | A file in `slides/` has no `<section class="slide">`, so it draws nothing | — |
| `DEK008` | `project`, `deck` | A key in `dek.toml` (inline tables such as `voice = { … }` included) or the frontmatter that dek does not read. The hint names the key it most likely meant. Warning | — |
| `DEK009` | `slide` | A file in `slides/` holds more than one `<section class="slide">`; only the first is shown | — |
| `DEK010` | `slide` | A class that neither the theme nor the slide's own stylesheet defines | — |
| `DEK011` | `slide` | `<style>`, `style=`, `<script>`, a `<link>` inside the slide (one in a full document's head is dropped with it), an event handler attribute (`onclick=` and the like), or a `javascript:` URL inside a slide | — |
| `DEK012` | `deck`, `slide` | A selector in the theme that is not under `.slide`, at the top level or inside an at-rule such as `@media` (a rule nested in a `.slide` rule is under it), or a rule in a slide stylesheet that reaches past the slide (`::view-transition-*`, `:root`, `html`, `body`, a step from `.slide` to a sibling with `~` or `+`, and the at-rules that register something for the whole page: `@font-face`, `@import`, `@property`, `@counter-style`, `@page`, `@font-palette-values`, `@font-feature-values`). Each finding names its line and where the rule belongs | — |
| `DEK013` | `deck` | The theme defines more classes than `max_classes` (default 40) | — |
| `DEK014` | `deck`, `slide` | A raw design value outside a token: a color (hex, function, named, or system), a font family (in `font-family` or the `font` shorthand), a length in an absolute, viewport, container, or root unit, a time, or an easing written out. In the theme or a slide stylesheet, nested rules included; a custom property is a token only where tokens are set, on `.slide` or a view transition. A string such as `content: "#fff"` is text, not a value. A presentation attribute in a slide (`fill`, `stroke`, `color`, `stop-color`, `font-family`, `<font face>`, `bgcolor`) holding a raw color or family is one too: an attribute cannot take `var()`, so the hint moves it into `slides/<id>.css`; `fill="none"` and `currentColor` pass | — |
| `DEK015` | `deck` | A required token is missing from `.slide` | — |
| `DEK016` | `slide` | A slide script that cannot run: an import, a named export, no default export or one that is not an object, a `draw` that is not a function, a syntax error, top-level await or code that throws, a `motion` key that is not a beat of the slide or a value that is not a non-negative number of milliseconds, top-level code that does not finish, or a script saved as `.js` instead of `.ts` | — |
| `DEK017` | `slide` | A slide script that would not draw the same frame for the same `t`: a timer, `requestAnimationFrame`, `Date`, `performance.now`, or `Math.random`; a class used to find an element (`querySelector`, `closest`, `matches`, `getElementsByClassName`); or a reach into the document (`document.querySelector`, `document.getElementById`, `document.body`, …), which finds the right element on a still page that holds one slide and another slide's in the built deck, which holds them all | — |
| `DEK018` | `deck` | The deck has no `theme.css`, so it shows unstyled and the theme rules cannot run | — |
| `DEK019` | `slide` | A `data-layout` that neither the theme nor the slide's own stylesheet defines. Checked when the theme defines at least one layout | — |
| `DEK020` | `deck`, `slide` | A remote URL (CDN, remote image), in any attribute that names a URL, or in a `url()` or `@import` of theme.css or a slide stylesheet | — |
| `DEK021` | `deck`, `slide` | A file the deck loads does not exist: an image, a `srcset` candidate, a video, audio, track, poster, frame, or object, or a `url()` in theme.css or a slide stylesheet. When the project's `assets/` has it, the hint says to copy it into the deck | — |
| `DEK022` | `deck`, `slide` | A path that leaves the deck directory | — |
| `DEK023` | `deck`, `slide` | A local file the deck loads (`src`, `srcset`, `poster`, …, or a `url()` in theme.css or a slide stylesheet) that does not start with `assets/` | — |
| `DEK024` | `slide` | A heading with nothing to read: no text, no image, no `aria-label`. An id-only `##` heading after the first slide makes one. Warning | — |
| `DEK025` | `slide` | A numeric `data-step` that points at a beat with an id. Warning | — |
| `DEK026` | `slide` | The same declaration under the same selector in the stylesheets of three slides or more. Warning | — |
| `DEK027` | `deck` | `script.md` cannot be read: its frontmatter, a heading without a valid `{#id}`, or a beat before any slide. One finding per problem | — |
| `DEK028` | `slide` | A `data-morph` name that neither the slide before nor the slide after has, so nothing morphs. Warning | — |
| `DEK029` | `slide` | Text under `aria-hidden="true"`, which lint does not measure: a figure's labels, an SVG's `<text>`. `<title>` and `<desc>` are not drawn and do not count. Warning, since a sample the talk shows as unreadable belongs there | — |
| `DEK030` | `slide` | An element or its text runs past an edge of the frame the audience sees when rendered, at any beat, or text is cut off by an ancestor with `overflow` other than `visible` | — |
| `DEK031` | `slide` | Contrast below 4.5:1, or below 3:1 for WCAG large text (24px+, or 18.66px+ bold) | — |
| `DEK033` | `slide` | Two texts are drawn over each other, a folio or a running head a pseudo-element draws included | — |
| `DEK032` | `slide` | A slide script's `draw` misbehaves while drawing the end of a beat: it throws, changes the page outside its slide, or draws the end differently after drawing the beat's start | — |
| `DEK040` | `slide` | An ASCII word missing from the pronunciation dictionary. Warning | — |
| `DEK041` | `deck` | The talk's length far from the `duration` budget: narrated length with a Timeline, the reading-time estimate without. Warning | — |
| `DEK042` | `slide` | A beat with visible content (list, code, table) but no spoken paragraph. Warning | — |
| `DEK043` | `deck` | A `[beats]` key in `voice.toml` that matches no slide or beat. Warning | — |
| `DEK044` | `deck`, `slide` | A `#` or `####` heading in `script.md`. Only `##` (slide) and `###` (beat) mean anything, so any other level is read out as script. Warning | — |
| `DEK045` | `deck` | `voice/voice.toml` or `voice/dict.toml` cannot be read. The checks that need it are skipped, the rest of lint runs. Warning | — |

## Conditions

- `DEK030` through `DEK033` run only with `--visual` and require Playwright. They measure each beat as it ends, with every animation and transition run to its end; see [What a still shows](/guide/steps#what-a-still-shows).
- `DEK040`, `DEK042`, `DEK043`, and `DEK045` apply only to decks with `voice/`; `DEK044` applies to every deck. `dek cues` reports `DEK042` regardless.
- `DEK041` applies to decks with a `duration`. With a Timeline it measures the narration (20% margin); without one it uses the reading-time estimate (35% margin). `data` carries `actualSeconds`, `budgetSeconds`, and `source` (`timeline` or `estimate`).
- `DEK008`, `DEK024` through `DEK026`, `DEK028`, and `DEK040` through `DEK045` are warnings: reported with `"severity": "warning"`, and they do not fail lint. Every other rule is an error. Voice never makes a live-only deck fail.

## Notes

### DEK001 / DEK002

`DEK001` points at the section heading in `script.md`; `data.expected` is the HTML path it looked for. `--fix` syncs first: it creates the skeleton, removes an orphan that is still an untouched skeleton with nothing beside it, and never touches a slide you have edited, so a `DEK002` that remains is a file with your work in it. One orphan and one section without its own HTML (missing, or still the generated skeleton) suggest a rename: both diagnostics carry `` run `dek mv <old> <new>` `` as the hint, and the command works whether or not `script.md` was edited first. With more than one candidate, each orphan's hint names a `dek mv` for every section it could be, in script order, instead of suggesting a new section or deleting the file. Whenever there is a candidate, the orphan's `data.renames` lists them.

### DEK003

An unresolvable reference. A beat with no element is fine, and positions need not be consecutive. The hint lists the ids and positions the slide can use.

### DEK005

A `data-morph` name must be unique within a slide, because it becomes a `view-transition-name` and the browser needs exactly one element on each side of the transition. The same name on two different slides is the intended use.

Some names are taken. The player names the slide box `slide`, and the browser names the page `root`; a morph with either name would collide with the page change itself. `none`, `auto`, and `match-element` are keywords of `view-transition-name`, so the element would not morph at all.

### DEK010

Clear it by defining the class in `theme.css`, or in `slides/<id>.css` when only that slide uses it. Growing the shared vocabulary is a design decision; lint makes it one visible step. `DEK013` caps how often that step can be repeated, and slide stylesheets do not count toward it. The hint lists the classes already defined, and when the class is a typo of one of them (two edits or fewer) it starts with `did you mean slide-title?`; `data.suggestion` carries that name. If the class is only there for `slides/<id>.ts` to find an element, use a `data-*` attribute instead.

### DEK014 / DEK015

The hint names the theme tokens that could take the value's place: color tokens for a color, `--size-*` for a `font-size`, and so on. It names only tokens published on `.slide`, the theme's and, in a slide stylesheet, the file's own, since a token set on one layout, one element, or under `@media` does not reach every rule. In `theme.css`, when none fits, it says to add a token to `.slide`. In a slide stylesheet it also offers a token of the slide's own, such as `.slide { --<name>: 260px; }` at the top of `slides/<id>.css`, since a value one slide uses need not join the theme.

Each value is read as CSS reads it, one component at a time, so `-12px` is a length like `12px`, and a color name counts only in a property that takes a color: `tan` in `grid-area` names an area. Raw values are allowed only when assigning a `--*` property on `.slide`, a compound of it such as `.slide[data-layout="split"]`, or a `::view-transition-*` pseudo-element; set on any other rule, the custom property carries a raw value past the rule, and the hint moves it onto `.slide`. A rule that changes a token the theme or the slide's own `.slide` sets, as `.chance { --seal-box: 120px }` makes one card's seal larger, would lose its change there; the hint names the value on `.slide` after the rule, `--seal-box-chance: 120px`, and points the rule's token at it, `--seal-box: var(--seal-box-chance)`, which passes. `data.token` carries the name. Unitless `0`, `thin`, `%`, `fr`, and the units that follow the element's own font (`em`, `ch`, `lh`, `ex`) pass, and so do easing keywords such as `ease-out`; `cubic-bezier()`, `steps()`, and `linear()` want a token, and the hint offers one that holds an easing. `var()` with a raw fallback does not pass. All thirteen tokens in the contract must be published on `.slide`; extra tokens are welcome.

### DEK011

Each occurrence is its own diagnostic, at its line and column, so one run lists every inline style and script. `data` says what was found: `{ "kind": "element", "name": "style" }`, or `{ "kind": "attribute", "name": "onclick", "value": "go()" }` for an attribute. A slide takes no input, so an event handler has nowhere to move; motion goes in `slides/<id>.ts`.

### DEK016 / DEK017

`DEK016` means the script cannot run; `DEK017` means it runs but depends on something other than `t`, or finds elements by a class the theme may rename. Both point at the script file, and `DEK017` at the line. A script with an import is still evaluated with the import removed, so its `motion` keys are checked in the same run.

### DEK020 / DEK021 / DEK022 / DEK023

Self-containment. Nothing remote, nothing from the project root, nothing from a sibling deck. Local files start with `assets/`.

One table decides which attributes name a URL and what the page does with it. A resource is loaded to draw the slide: `src`, each `srcset` candidate, `poster`, `data` on `<object>`, and `href` on SVG `<image>` and `<use>`. A resource must exist (`DEK021`) and be written as `assets/...` (`DEK023`). A link is only followed: `href` on `<a>`, `<area>`, and `<link>`. A link must still be local and inside the deck (`DEK020`, `DEK022`), from both places a slide is read, the deck and its `slides/`, so `<a href="../other-deck/">` is `DEK022`. `http:` and `https:` are remote with or without their slashes, and a `file:` URL names a file on one machine, outside any deck (`DEK022`). In a stylesheet, the strings `image-set()` takes are addresses like its `url()`s. Every URL is reported at its own line and column. A symlink is judged by where it leads: one in `assets/` that points out of the deck is `DEK022`, and neither the build nor the dev server reads it. This is what allows `dek build` to inline every asset and the project-root dev server to serve them.

### DEK024

`dek sync` never puts a section id on a slide, so a `##` heading that is only an id (`## architecture`) gets an empty `<h2 class="slide-title">` in its skeleton, unless it is the first slide, which takes the deck title. While the file is still that skeleton, the hint says to give the heading a title in `script.md`, like `## Architecture {#architecture}`, and run `dek sync`, which rewrites the skeleton; the id and file name stay. An id-only heading can also mean the slide has no title, as a quote's does, so the hint adds the other way out: remove the element from the slide, which makes the file yours, and sync leaves it alone. Once the slide is edited, the hint says to write the heading's text or remove the element. It is a warning because a slide script may fill the heading as the slide draws.

### DEK025

A number in `data-step` means "the k-th beat of this slide", so a beat inserted above it moves the binding to a different beat without any error. When the beat at that position has an id, the id says the same thing and does not move, so the hint names it: `use data-step="turn"`. Lint only sees the script as it is now: after an insertion, the id it names is the beat that now holds the position, so check that it is the one you meant. A beat with no id has no other name, so its position raises nothing; give it a `{#id}` to make it stable. `data` carries `step` and `id`.

### DEK026

A declaration three slides each write in their own stylesheet is a fix the theme is missing: agents working on one slide each will make it again on the next. Selectors are compared as the slide's scope reads them, so `.card` and `.slide .card` are one selector and `.slide > .card` is another; a rule inside `@media` is compared only with the same rule inside the same `@media`. Each slide gets one finding per selector, in its own `dek check`, naming what it shares there and every slide it shares any of it with; `data` carries `selector`, `declarations`, and `slides`. The hint writes the rule as `theme.css` must hold it, under `.slide` (`.card` becomes `.slide .card`, which the theme's own scoping rule, `DEK012`, accepts), and says to delete it from each slide. Moving it changes every slide that uses the selector's classes without setting it, too; the hint names those slides, and `data.alsoReaches` lists them, so a default the three slides override is weighed against the slides that rely on it. Keyframes are left alone, since each slide's are renamed apart.

### DEK027

Nothing else in a deck can be checked against a script that does not read, so these are the deck's only findings until it does. Every problem is reported in one run, each at its line with the fix: the heading and its frontmatter are read on their own, and a heading that cannot be read still opens its slide, so the beats under it are not reported as well. `dek lint` reports them wherever it runs, inside the deck or at the project root, and the dev server shows them all. A command that cannot work without the deck, such as `dek build`, stops on the first with the same message and hint.

### DEK028

A morph carries an element into the element of the same name on the slide it goes to, and only the slide right before or after counts: a partner two slides away is never on screen at the same time. A name neither neighbor has is a plain fade, which lint cannot tell from a typo, so it is a warning at the attribute. When a neighbor has a name one or two edits away that nothing on this slide already pairs with, the hint asks whether that was meant (`did you mean "p-99", as in slides/b.html?`); otherwise it names the neighbors' files to give the partner in, or says to remove the attribute. Reserved names are left to `DEK005`. `data` carries `morph` and `neighbors`, the slugs of the slides beside it.

### DEK030

The finding goes where its cause is, found the way a contrast's is: what the slide script's `draw` changed is taken back first, then the slide's own CSS is taken away, and the page is measured again after each. An element that fits once `draw` is undone is the script's: the path is `slides/<id>.ts` and `data.origin` is `"script"`. One that fits without the slide's CSS is that stylesheet's: `slides/<id>.css`, `"slide"`. One that overflows with both gone is its content, too much for the slide: `slides/<id>.html`, `"content"`, and the hint keeps the fix on the slide: cut or split the content, or size it in `slides/<id>.css`. It never suggests changing a theme token, which would move every slide. An element with no text may be decoration meant to bleed, and the hint says to mark it `aria-hidden="true"` if so.

The message names the element, the start of its text, the edge, and how many pixels it runs past. A child is reported only for an edge its parent stays inside, so a list that runs off the bottom is one finding. The same finding on several beats is one diagnostic that names every beat. Text is measured as well as boxes, so an unbreakable string such as a URL counts even when its box fits.

The edge is the frame's: the slide at its logical size, however tall its CSS makes it or however it is scaled, since the player shows that much and no more. Text an ancestor inside the slide cuts off, with `overflow: hidden` or the like, is reported the same way, named by the ancestor: `p.note "…" is cut off by div.card past its bottom edge by 40px`, and `data.clip` names it. An ellipsis or a line clamp is a truncation the author asked for and passes.

#### Decoration

An element marked `aria-hidden="true"`, with everything inside it and its pseudo-elements, is decoration, and neither `DEK030` nor `DEK031` measures it. That is how a glow bleeds off the slide on purpose, or a slide shows a sample of text too faint to read. The mark has a cost that keeps it honest: screen readers skip what it covers, so it never goes on text the audience should read.

### DEK031

Thresholds follow WCAG AA: 4.5:1 for body text, 3:1 for large text. Large text is a computed `font-size` of 24px or more, or 18.66px or more at `font-weight` 700 or above. A big number in a soft color passes; the same color on body text fails. The thresholds are not configurable. The message names the element, its text, and both colors.

Contrast is measured from pixels, not from styles. Each beat is drawn with its text as shown, with every glyph transparent, and with every glyph filled white and then black. The white and black drawings show where the glyphs are, whatever their color; within them, each pixel of the text is compared with the pixel it sits on. Gradients, background images, glows, overlapping elements, opacity, blend modes, and colors in any syntax are measured as drawn.

A text's own `text-shadow` can set it off but never hides it. Where some text casts a shadow, the beat is drawn once more with no shadows, and each pixel of the text reads against its shadow or against what is behind it, whichever it stands out from. A glow that makes white text readable on a white slide counts; a shadow cast off the letters in another color, which half of each glyph sits on, does not bring the ratio down. Text blended into what is under it with `mix-blend-mode` is compared as the audience sees it, blended; only the white and black drawings, which find the glyphs, draw it unblended.

Only the pixels a text's glyphs cover most are read, each taken back to the color a glyph covering the whole pixel would draw, so antialiasing never lowers a ratio and a thin hyphen reads at its own color. The ratio reported is the one all but the worst 2% of those pixels reach: text over a gradient is judged by the part that reads worst. `fg` and `bg` are the two colors at that pixel. Where two texts overlap, neither is judged by the shared pixels unless it has no others. Text a `::before` or `::after` draws, such as a folio from `counter()` or a running head, is measured like any other and reported as `section.slide::after`. Its `content` counts as text when it has a letter or a digit, or comes from `counter()`, `counters()`, or `attr()`; a quote mark or an arrow on its own, a glow, and a rule count as background. `DEK030` does not measure pseudo-elements. SVG `<text>` is measured like any other text.

When a text falls short, the page is taken apart one layer at a time and measured again, and the finding's `path` and hint go to the layer that brought it down. First what the slide script's `draw` changed in attributes, its inline colors above all, is taken back: if the text now clears the threshold, `draw` is the cause, and since a color it sets inline wins over any stylesheet, the fix goes to `slides/<id>.ts` and `data.origin` is `"script"`. Then the slide's own `slides/<id>.css` is taken away: if the text clears it now, the fix stays in `slides/<id>.css` and `data.origin` is `"slide"`. If it still falls short, the theme alone draws it that way: the fix goes to `theme.css`, where one change reaches every slide that uses the same pair, and `data.origin` is `"theme"`. A slide with neither leaves every color to the theme.

### DEK032

Every still, whether a shot, a thumbnail, the PDF, or a page `--visual` measures, draws each slide at the end of its beat, and checks the draw as it goes. No pixel measurement can tell these from a slide meant to look the way it does, so each is reported instead, with every beat it happens at (`data.kind`):

- `throw`: the draw threw, which leaves the slide as it was before it ran.
- `reach`: the draw changed the page outside its slide. On its own page a draw that finds its elements through `document` finds its own; so `--visual` also draws every slide on one page, as the built deck holds them, where it finds another slide's.
- `seek`: drawn at the start of the beat and then at its end, the draw drew the end differently than at first, so it keeps state between calls, and a seek in a video, a shot, or the presenter cannot replay it.

The presenter keeps going whatever a slide does; the fix is in `slides/<id>.ts`. `data` carries `kind`, `message`, and `steps`.

### DEK033

Two texts whose lines cross by a few pixels each way, and share a fifth of the smaller one, are drawn over each other: neither reads. Lines that only touch, as the words of one sentence set in two elements do, pass. A folio or a running head a `::before` or `::after` draws is one of the texts, judged by the box its glyphs cover rather than the box it is laid out in, which for a full-width running head is the whole line. Each text in a pair the boxes suggest is drawn alone to see where its glyphs show. One none of whose glyphs shows was replaced when the text it crosses takes its place, its lines spanning much the same box: numbers stacked in one cell to count up, each beat's painting its box over the one before, show only the last, and collide with nothing. Under anything else, such as a callout laid over a row of labels, the audience loses it, and it collides. One a box covers only in part collides too, since the audience sees it cut off. The hint says whether to move the content or make room for it. `data` carries `box`, `other`, their texts, and `steps`.

### DEK042

Only paragraphs are spoken. A beat that shows a list, code, or a table without a paragraph passes in `pause.beat` milliseconds when narrated. Empty beats and blockquote-only beats are treated as deliberate pauses and are not flagged.
