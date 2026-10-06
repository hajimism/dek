# 6. Require every picture to say what it shows or that it is decoration

Date: 2026-10-06

## Status

Accepted

## Context

dek lints what it can measure, and contrast (`DEK031`) was its only check on what reaches an audience that does not see the slide as drawn. A built deck is one HTML file, read by the audience's screen readers as it is: an `<img>` without `alt` is read as its file name, and a diagram drawn as an SVG of shapes alone is skipped. Quarto runs axe over its revealjs slides in the browser that shows them; no tool among those compared checks this when the deck is built, from one CLI run, as SARIF and JSON.

What a picture shows is the author's call, and lint cannot judge the words. It can tell whether a picture says anything at all, from the markup, without a browser. The cost of a rule here is false positives: an error that is not one teaches an agent to add words for their own sake, and a hint that leads to another finding stalls it. Two existing rules bound what this one may ask:

- `DEK029` warns of text under `aria-hidden="true"`, which lint does not measure. A hint of "name it or mark it `aria-hidden`" given to an SVG with `<text>` labels sends the agent from one finding to the other (criterion 4).
- `DEK024` counts an `<img>` or an `<svg>` in a heading as something to show; it is about the heading, not the picture.

The theme's `full-bleed` layout example writes `<img … alt="">`, and `dekc theme full-bleed` hands that markup to agents to paste. The sample's pictures, as of this date: every `<img>` has a meaningful `alt`; of the SVGs, those with no text are all `aria-hidden="true"`, and the three with neither a name nor `aria-hidden` (`why-dek`'s `themes`, `measure`, `agents`) are diagrams labeled with `<text>`.

## Decision

**`DEK034`, an error at the picture's tag: a picture with nothing for a screen reader to say.** It is a static rule in the slide HTML scan, so `dekc check`, `dekc lint`, the dev server, and `dekc build`'s counts report it without Playwright. A picture is:

- an `<img>` without an `alt` attribute;
- an `<svg>` that holds no text, not even a `<title>` or a `<desc>`, and has no name;
- an element with `role="img"` and no name, an SVG included. The role makes it one picture whose own text a screen reader no longer reads, so text inside does not count; a `<title>` in an SVG does.

A name is a non-empty `aria-label`, `aria-labelledby`, or `title`. A picture under `aria-hidden="true"`, or with `role="presentation"` or `role="none"`, is decoration and is not checked. An SVG inside another is part of the outer one.

**`alt=""` declares decoration.** It is how HTML has always said it, and it keeps the theme's `full-bleed` example passing as written, so it is no exception. Whitespace in `alt` passes too. On an SVG, the declaration is `aria-hidden="true"`.

**An SVG with text of its own passes.** Its `<text>` is read, and `DEK031` and `DEK030` already measure it, so it is not a picture without words. That keeps the three sample diagrams passing without a change, and it means the hint offers `aria-hidden="true"` only to SVGs with no text, which `DEK029` never reaches. For `role="img"` with text inside, the hint offers a name or removing the role, never `aria-hidden`.

The hints are what to type: `add alt="…" saying what the picture shows, or alt="" if it is decoration` for an image; `give it role="img" and aria-label="…" saying what it shows, or aria-hidden="true" if it is decoration` for an SVG. `data` carries `tag`, the image's `src`, and `role` when the finding is about `role="img"`.

**Error, not warning.** A picture without words is not done, and every way out is one attribute. The sample, a new project, and `dekc new` pass as created, which a test of every sample deck and of every layout example in the bundled theme holds.

**Not checked.** `<video>`: its alternative is captions, which no attribute says are right. `<iframe>` and `<object>`: rare in a self-contained deck, and the self-containment rules already constrain them. `<canvas>`: no deck draws one yet. Whether the words are good, and what lies outside a slide (heading levels, reading order, the page's language), which the page around the slides is dek's to get right. axe is not adopted: it needs a browser, and it would be a dependency for the few checks it adds over this rule.

The generated `AGENTS.md` gains one convention, mapped to `DEK034`, saying how each kind of picture says what it shows.

## Consequences

A built deck carries a text alternative for every picture its slides wrote, or an explicit statement that there is none to give, and an agent learns which from one run.

An existing deck with an `<img>` lacking `alt`, or a bare SVG of shapes, fails lint after upgrading until each gets one attribute; the hint names it. An SVG drawn as decoration inside a `<figure>` whose caption already says everything still needs `aria-hidden="true"`, which costs a word and says what was meant.

`docs/public/llms.txt` still reads "DEK001 to DEK044"; bringing it in line with the rules, this one included, is left to the decision on how the agent guidance is kept accurate.
