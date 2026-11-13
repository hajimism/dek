# 59. Give the dek.pub talk page a side column of slides and details, and keep the review in a panel

Date: 2026-11-14

## Status

Accepted

## Context

On a screen 1280 pixels wide or more, the talk page had a third column beside the article. It held the review panel, its cards placed by the anchor each pointed at in the article, the way a margin of notes is. Below 1280 pixels the same panel was a drawer, and below 1024 a sheet from the bottom.

That column served only a reader of the review. Everyone else saw an empty space. And the review now has a place made for it: full screen, beside the slide it is about (ADR 58). The comment requirements give the column to every reader:

- the slides' titles as a table of contents, that moves the deck and marks the slide on screen;
- the talk's details: who gives it, when, which version, how many slides;
- for a reader of the review, its open threads and a way into it.

Below 1024 pixels the table of contents is to fold under the viewer.

## Decision

**At 1280 pixels and wider, the column beside the article is the side column** (`deck/feature/talk/ui/side-column.svelte`), for every reader. It sticks below the header, and holds:

- **the review,** for those who may read it: the count of open threads and "Open the review", which opens the theater in review mode (ADR 58);
- **the slides,** by title, or by slug for a slide without one, numbered. The one on screen is marked, and a click moves the deck there (`slide-toc.svelte`);
- **the details:** the speaker, the talk's date when it has one, the version shown and its length in slides.

**Below 1280 pixels the slides fold under the viewer**, in a `<details>` closed at first, the same list as the column's. Between 1024 and 1279 pixels, where the requirements name neither, the fold is shown too, since there is no column there.

**The review panel opens as a drawer at 1024 pixels and wider, and as a sheet below**, from the byline's "Review" button, the floating pill, a pin, a link to a thread, or a comment started on a quote or an element. It no longer sits in the column. Its cards no longer follow their anchors down the article: the article's own pins and marks show where each thread points, and the panel lists them in order.

**What was not chosen:**

- **The review above the slides in the column, as before.** The review would be in the way of every reader who cannot read it, and twice on the page once full screen has it.
- **Keeping the cards beside their anchors in a drawer.** A drawer covers the article it would be aligned to.
- **A table of contents that only the article's headings make.** The deck's slides are what the reader moves through; the article has a section for each already.

## Consequences

- `CommentsPanel` loses `anchorTops` and the layout that placed cards by them. The talk page no longer measures where anchors are.
- The talk page's grid at 1280 pixels and wider is the article and the side column, for every reader, not only for readers of the review.
- `tests/browser/side-column.test.ts` checks:
  - the table of contents, with its current slide;
  - a click on a slide;
  - the details;
  - the review's way in, and its absence for others.
- The talk's publication date in the details is the date the deck's frontmatter gives, not the date its version was uploaded.
