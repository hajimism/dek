# 60. Take the dek.pub talk page's table of contents to the article, and mark the slide being read

Date: 2026-11-14

## Status

Accepted

Amends [59. Give the dek.pub talk page a side column of slides and details, and keep the review in a panel](0059-give-the-dek-pub-talk-page-a-side-column-of-slides-and-details-and-keep-the-review-in-a-panel.md)

## Context

ADR 59 put the slides' titles in the side column as a table of contents, where a click moves the deck to that slide and scrolls the page up to it.

The side column sticks beside the article, not beside the deck. A reader using it is reading the article, a long way below the viewer. A click took them away from the text they were reading, back up to the deck. What they wanted was the article's section for that slide. The deck stays a scroll away, and each section already has its own way to show its slide.

The mark had the same mismatch. It followed the slide on screen in the deck, which does not change while the reader scrolls the article. So the list beside the text marked a slide the reader had left long before.

## Decision

**Each entry in the table of contents is a link to its slide's section of the article,** `#<slug>`, the heading's own id. A plain click scrolls the page smoothly to the heading, below the sticky header, and puts the fragment in the address without adding a history entry, the way a link to a thread does. A link opened in a new tab or copied keeps the fragment, and a talk opened at `#<slug>` already opens its deck at that slide. A talk whose script is hidden has no sections, so there a click moves the deck as before. The fold under the viewer below 1280 pixels works the same way.

**The mark is on the slide being read** (`aria-current="location"`). That is the last section whose heading has crossed a line a third of the way down the window (`deck/feature/talk/reading.ts`). Above the article, the mark falls back to the slide the deck shows. A slide picked from the list stays marked until the reader next moves the page themselves, by wheel, touch or key, because the last sections cannot scroll up as far as the line.

**What was not chosen:**

- **Keeping the click on the deck.** It was the behavior that took a reader away from their place in the text.
- **Moving both the deck and the article.** The deck is out of sight while the reader is in the article, so moving it is work nobody sees. When the reader goes back up, the deck should be where they left it.
- **Marking the slide on screen in the deck.** A list beside the article should say where in the article the reader is.
- **`scroll-behavior: smooth` on the whole document.** Every other jump in the app would animate too, the scroll back to the top on a new page among them. The talk page scrolls smoothly where it asks to, as it does for threads.

## Consequences

- `slide-toc.svelte` renders links, not buttons. A plain left click with no modifier key goes to `onslide`, and anything else is left to the browser.
- The talk page measures the headings' positions on scroll and resize, once per animation frame, to keep the mark current.
- `tests/browser/side-column.test.ts` checks the links' fragments, the `location` mark and the click. `tests/unit/deck.test.ts` checks which slide is being read.
- ADR 59's other decisions stand: the column, the fold, the details and the review panel.
