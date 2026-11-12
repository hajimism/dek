# 45. Let a page that frames a built deck drive it through postMessage

Date: 2026-11-12

## Status

Accepted

## Context

dek.pub shows a built deck in an `<iframe>` beside a server-rendered script article, and lets reviewers leave comments anchored to an element of a slide. The frame is sandboxed (`allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`) and served from an origin of its own per deck, `d-<id>.dekusercontent.com`, so the deck's scripts can never reach the page around it. The page around it still has to:

- know which slides and steps the file holds, and the size its slides are drawn at;
- move the deck when the reader clicks a passage of the article, and follow the deck when the reader moves it with the keys;
- let a reviewer point at an element of the slide shown and learn what it is, in the shape of `ElementTarget` in `src/pub/protocol.ts`;
- show where the comments already left are, and open one when its marker is clicked.

A cross-origin frame offers one channel for all of it, `window.postMessage`. A built file had nothing listening on it. Annotate mode, in `src/runtime/annotate*.ts`, already finds the element under a pointer, names it, and measures it on the slide, but only on the dev server's pages, where each element is stamped with the line it is written on; a build carries no such stamps.

## Decision

**The player of every page dek writes gains an embed API, started only when the page is framed** (`window.parent !== window`). Its messages are plain objects whose `type` starts with `dek:`, and their shapes, with the checks on them, are in `src/core/embed-protocol.ts`, which the player bundles without zod and the server can import for its types. `docs/reference/embed.md` is the reference.

**What the deck sends,** to `window.parent` with the target origin `"*"`:

- `dek:ready` once the player has started: `protocol` (1), the deck's folder name, `size`, the slide's own size in pixels, which the build stamps on the page's `<body>` as `data-size` from the deck's `ratio` (1280×720 for 16:9, 1024×768 for 4:3) rather than the player measuring it, every slide's `slug` with its `steps` as `dekc shot --step` takes them, and `current`, `{ slug, step, index }`.
- `dek:moved` with `{ slug, step, index, by }` on every move, posted as the move starts, so a page follows the key press rather than the end of its transition. `by` is `embed` for a move `dek:goto` asked for, and `reader` for any other: keys, pointer, rail, URL hash, another window. A page that scrolls its article to follow the deck, and moves the deck when the article scrolls, so tells its own moves from the reader's and does not loop. A move that ends where the deck already stood posts none. It is also the answer to `dek:current`, with `by: "embed"`.
- `dek:picked` in pick mode, with the slide's `slug` and `step` and an `ElementTarget`: `path` `slides/<slug>.html`, `name` the tag and classes, `text` the element's text the reader can see, less what is in a beat not reached yet, a `<style>`, or anything else hidden, cut to 40 characters as annotate mode cuts it, and `box` in the slide's own pixels from its top left corner, rounded, measured by annotate mode's `slideBox`. Dividing a box by `size` places it on a static picture of the slide, which is how dek.pub draws a comment's pin on its slide images.
- `dek:pick-cancel` when Escape leaves pick mode, and `dek:mark` with the mark's `id` when a pin is clicked.

No message carries the script, notes, or anything else of the presenter view, even from a build without `--public`; tests check that a phrase of the script, which the page carries for its presenter view, reaches no message. What the messages do carry goes to `"*"`, so to any page that frames the deck: `dek:ready` alone names the deck's folder, every slug, and every beat id, and `dek:picked` the text of what was picked. For a public deck that is what any reader sees. For a deck that is not public, the host must keep other sites from framing it, with `Content-Security-Policy: frame-ancestors` naming only its own pages; dek.pub's Worker that serves the decks sends that header.

**What the deck takes,** read only when `event.source === window.parent`, and only when the message has exactly the fields its type names with the right types, else ignored without an answer: `dek:goto` (`slug`, optional `step`, `"0"` when absent; an unknown slug or step is ignored), `dek:current`, `dek:pick` (`on`), and `dek:marks` (`marks`, each `{ id, number, slug, step, box }`, replacing the ones before). Strings are 1 to 256 characters, at most 1000 marks, in a list with no hole and no field but its marks (a message keeps a hole, and `every` passes over one), numbers finite, boxes not negative in size, and `number` a whole number from 0. The deck keeps its own copy of the marks it is given.

**A framed deck keeps its moves to itself.** `dek:goto` goes through the deck's control as a key press does, with an origin of its own, `embed`, and the URL hash follows. While the deck is framed, every move, the reader's as well as the embed API's:

- **replaces the deck's history entry** instead of adding one. A frame's history entries join the framing page's session history, so a `dek:goto` per passage, or a key per slide, would make the page's Back step the deck back instead of leaving the page. The history is the framing page's.
- **is not posted on the deck's BroadcastChannel.** Under storage partitioning, the windows a framed deck's channel reaches are those of the same deck under the same top-level site: other frames of the same page, such as two versions side by side, which would otherwise drive each other. A popup the reader opens from the frame is a top-level page of its own, in another partition, and would not hear it anyway. The framing page moves each of its frames itself. The deck still follows what arrives on the channel, and posts `dek:moved` with `by: "reader"` for it.

A deck nobody frames is unchanged: its moves add history entries and reach its other windows as before.

**A framed deck shows the slide alone.** Its slide rail starts closed, whatever the reader chose for the deck on its own, and the hint naming its keys is taken away as the player starts: on a phone the hint covers the slide, and the rail takes a third of a viewer a thousand pixels wide. The keys still work. Opening or closing the rail in a frame is not remembered, so the reader's choice for the deck opened on its own stays as it was. The page that frames the deck is the one to say what keys there are, if it wants them said.

**`dek:ready` means the deck takes `dek:goto` now.** It is posted once the player has put its first slide on the page, and a `dek:goto` sent as soon as it arrives moves the deck. A move between slides plays a view transition, whose update runs only once the page draws a frame; a frame kept out of the layout (`display: none`) or out of view is not drawn, and a move there waited for ever, with every move after it queued behind. So a slide transition whose update has not run within 250 ms is skipped, which runs the update without the animation, in any deck, framed or not.

**Pick mode reuses annotate mode's element finding.** `candidatesAt` takes the elements it may pick as a parameter: annotate mode passes its stamped elements, and the embed API any element of the slide shown. Names are built as annotate mode builds them, the tag and then the classes, from the classes each element had when the player started, less the state classes the player sets (`is-current`, `is-shown`), so a name is one the author finds in `slides/<slug>.html` even after a slide script added classes. The embed API reads none of the dev server's stamps, so a build's player still carries no trace of them. While pick mode is on, a layer over the stage takes the pointer, so a click picks without moving the deck, and every element of the slides takes the pointer for hit testing, so a shape with `pointer-events: none` can be picked, as in annotate mode. Pick mode stays on after a pick until `dek:pick` turns it off or Escape does; an Escape typed into a field on a slide is the field's.

**Pins** are drawn in a shadow root over the deck, for the marks whose `slug` is the slide shown, at every step of it, each a small circle in dek's inspector blue (`#378add`, annotate mode's accent) with its `number`, centred on the top right corner of its box. The theme's `--accent` is not used: the default theme's is near white and could vanish on the slide behind it.

**What was not chosen:**

- **Checking the parent's origin instead of `event.source`.** The deck does not know the origin of the page that frames it, and any page may frame a built file; the source is the frame's own parent, which no other page can be.
- **A target origin other than `"*"`.** It would need the deck to be told its parent's origin, which only a message could tell it, and nothing sent needs hiding.
- **Publishing the embed API's moves on the BroadcastChannel,** as a key press's are in a deck standing alone. Two frames of one deck under one page would drive each other, and no window it could reach would be one the reader means to follow.
- **Keeping only the embed API's moves out of the history.** A key press inside the frame would still add an entry to the framing page's history, and Back there would step the deck back first.
- **Holding `dek:goto` until the frame is drawn.** The deck cannot tell that it is not drawn, and the page that hid the frame would see its moves lost until it showed the frame; skipping the transition costs only an animation nobody could see.
- **Measuring the size from `#deck`'s layout.** It is right in a browser that has laid the page out, and wrong before that, or wherever there is no layout; the build knows the ratio and says it.
- **Stamping source lines into a build** so annotate mode's code ran unchanged. It would grow every build and put file positions in a page for readers; the classes as built name the element well enough to find it.
- **Validating with zod.** The player bundles no zod today, and the checks are a few lines in the style of `src/core/live-protocol.ts`.
- **Drawing pins only at the step a mark names.** An element that appears at a later beat still has a box on the slide, and annotate mode draws its markers at every beat of their slide; the page keeps `step` to go there.

## Consequences

- Any page can frame a built deck and drive it, dek.pub first. A deck nobody frames runs no part of it beyond the check of `window.parent`.
- The player grows by about 7 kB minified, for the embed API and the parts of annotate mode it shares.
- A slide transition that takes more than 250 ms to reach its first frame, on a page too busy to draw, now plays without its animation; the move itself is never lost.
- A build without the script (`--no-script`) has no presenter view, so its key hint names only `s`.
- The message shapes are a contract with every page that frames a deck: a change a page written for protocol 1 cannot read bumps `protocol` in `dek:ready`, and needs a record of its own.
- `dek:moved` fires before a move's transition ends, so a page that measures the deck right after it sees the move under way; waiting for the deck's animations to finish is the page's to do.
- The server can import `src/core/embed-protocol.ts` for the message types; the zod shapes it validates comments with stay in `src/pub/protocol.ts`, and a test checks that a picked target parses as `ElementTarget`.
