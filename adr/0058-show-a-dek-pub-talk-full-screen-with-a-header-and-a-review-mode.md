# 58. Show a dek.pub talk full screen, with a header and a review mode

Date: 2026-11-14

## Status

Accepted

## Context

The talk page's Fullscreen button took the deck's stage full screen: the iframe and nothing else. A reviewer who wanted the slide large lost the review panel, the page number and a way out other than Escape. The comment requirements ask for more:

- a header that shows on demand with the title, the author, the page, the like and the review;
- a review mode with the panel to the right of a smaller slide, so the slide and its pins stay in view;
- `c` to enter and leave review mode;
- a sheet from the bottom on a phone;
- the page filled where the browser has no element full screen, as iPhone Safari has none.

What shapes it:

- **The deck is in a frame of its own origin** (ADR 45). A pointer over it and the keys pressed in it reach the deck, not the page.
- **The deck passes `c` to the page** (ADR 57), but only a deck built with a dek that does.
- **The review panel exists** on the talk page (`CommentsPanel`), with the mute bell, the filters and the composer.
- **Some browsers answer a full-screen request and show nothing**, or never answer at all, as an embedded web view did when this was tried.

## Decision

**Full screen is dek.pub's own frame around the deck, the theater** (`deck/feature/talk/ui/theater.svelte`). It holds the viewer's stage, the header and, in review mode, the panel. The viewer's Fullscreen button enters it. The stage then fits the room the panel leaves, and the viewer's bar is hidden.

**The theater fills the page at once, then asks for full screen.** A browser that grants it moves the theater there. One that refuses, has no element full screen, or never answers leaves it filling the page, above everything else on it. Leaving full screen on Escape leaves the theater too. While it fills the page, Escape leaves it.

**The header names the talk, its author and the page, and holds the like, the review button with its count of open threads, and a way out.** It shows when the theater opens, when the pointer comes to a strip along the top edge, or a tap lands there, and hides after three seconds without one. It stays while review mode is on. The review button is there only for someone who may read the review.

**Review mode opens the review panel beside the slide, or as a sheet under it below 768 pixels.** The panel shows the threads on the slide on screen, or all of them when the reader chooses "All slides", and offers "Comment on this slide" to pick an element. A pick made full screen opens the mode with its draft. The panel is the talk page's own, so it has the same filters, the bell and the composer. The mode toggles with the header's button, with `c` pressed on the page, and with `dek:key` from the deck. Every way to it works only while the theater is open, so `c` means nothing on the page itself.

**What was not chosen:**

- **The deck's stage alone full screen,** as before. Nothing of the page can be shown over a cross-origin frame there.
- **A header the deck draws.** The deck knows nothing of the talk's likes or review, and a deck built earlier would draw none.
- **Telling iPhone Safari apart by its user agent.** The theater fills the page wherever full screen does not take, which covers that browser and any other.
- **`c` as a key of the talk page outside full screen.** The review is beside the article there, and a key that does nothing visible would surprise.

## Consequences

- `Viewer` takes `immersive` and `onfullscreen`. `DeckLink` takes `onkey`, and `readDeckMessage` reads `dek:key`.
- `tests/browser/theater.test.ts` checks:
  - the header;
  - review mode from its button, from `c`, and from the deck's key;
  - the way out;
  - no review for someone who may not read it.
- A deck built with a dek before ADR 57 gets review mode from the header's button only.
- The theater's header is where the like and the review sit full screen. The talk page's side column (the table of contents and the deck's details) is a separate change, and is to open the theater in review mode from its own button.
