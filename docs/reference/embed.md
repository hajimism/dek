---
description: 'The embed API: how a page that frames a built deck moves it, hears where it is, picks an element on a slide, and draws numbered pins, through postMessage.'
---

# Embed API

A file `dekc build` writes can be shown inside another page, in an `<iframe>`, and driven from that page: moved to a slide, asked where it stands, asked to let the reader pick an element, and asked to draw numbered pins on its slides. This is how dek.pub shows a deck beside its script and its review comments, and any page can do the same. The decision and its reasons are in [ADR 45](https://github.com/hajimism/dek/blob/main/adr/0045-let-a-page-that-frames-a-built-deck-drive-it-through-postmessage.md).

The API runs only in a deck that is framed (`window.parent !== window`); a deck opened on its own has none of it. It talks through `window.postMessage`, and every message is a plain object whose `type` starts with `dek:`.

## Framing a deck

Listen before you set the frame's `src`, so you hear `dek:ready`:

```html
<iframe id="deck" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>
<script>
  const frame = document.getElementById("deck");
  addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    const message = event.data;
    if (message.type === "dek:ready") {
      frame.contentWindow.postMessage({ type: "dek:goto", slug: "plan" }, "*");
    }
  });
  frame.src = "https://example.com/talks/demo.html";
</script>
```

The sandbox above is the one dek.pub uses: the deck runs its scripts, keeps its own origin (so its URL hash and its other windows work), and opens links in a new window. The deck may be served from another origin than the page; dek.pub serves each deck from an origin of its own.

## What the deck sends

The deck posts to `window.parent` with the target origin `"*"`. Nothing it sends holds the script, the speaker's notes, or anything else of the presenter view, even from a build without `--public`, so any page that frames it may hear it.

| Message | When |
| --- | --- |
| `{ type: "dek:ready", protocol: 1, deck, size: { width, height }, slides: [{ slug, steps }], current: { slug, step, index } }` | Once, when the player has started. `deck` is the deck's folder name, `size` the slide's own size in pixels (1280×720 for `ratio: 16:9`, 1024×768 for `4:3`), and `steps` each stop of the slide in order. |
| `{ type: "dek:moved", slug, step, index }` | On every move, as it starts: a key, a click or swipe, the rail, the URL hash, another window of the deck, or `dek:goto`. A move that ends where the deck already stood sends none. Also the answer to `dek:current`. |
| `{ type: "dek:picked", slug, step, target: { kind: "element", path, name, text, box } }` | In pick mode, when the reader clicks an element. |
| `{ type: "dek:pick-cancel" }` | In pick mode, when the reader presses Escape in the frame. Pick mode is then off. |
| `{ type: "dek:mark", id }` | When the reader clicks a pin; `id` is the mark's. |

`slug` is the slide's id in `script.md`, `index` its place in the deck from 0, and `step` the stop as `dekc shot --step` takes it: `"0"` as the slide arrives, then each beat's `{#id}`, or its number when it has none.

In `dek:picked`:

- `path` is the slide's HTML file in the deck, as `slides/intro.html`.
- `name` is the element's tag and its classes as the build wrote them, as `div.chevron`. The state classes the player sets (`is-current`, `is-shown`) are left out, and so are classes a slide script added after the deck started, so the name is one you find in the slide's HTML.
- `text` is the element's text, spaces collapsed, cut to 40 characters with `…`. The slide itself, picked where the click hit nothing of it, has `""`.
- `box` is where the element is, in the slide's own pixels from its top left corner, rounded, however large the frame shows the slide. It is measured as annotate mode measures a note; divide by `size` from `dek:ready` to place it on a picture of the slide.

## What the deck takes

The deck reads a message only when `event.source` is the page that frames it, and only when the message has exactly the fields below, with the right types. Anything else, including a message with a field more, is ignored without an answer. Strings are 1 to 256 characters, numbers are finite, and a box's `width` and `height` are not negative.

| Message | What it does |
| --- | --- |
| `{ type: "dek:goto", slug, step? }` | Move to the slide `slug`, at `step` (as above; `"0"` when left out). A slug or a step the deck does not have is ignored. |
| `{ type: "dek:current" }` | Answer with `dek:moved` for where the deck stands. |
| `{ type: "dek:pick", on }` | Turn pick mode on or off. |
| `{ type: "dek:marks", marks: [{ id, number, slug, step, box }] }` | Draw these pins, in place of any drawn before; `[]` takes them all away. At most 1000; `number` is a whole number from 0. |

### Moves

`dek:goto` moves the deck as a key press does: the URL hash follows, and other windows of the same deck open on the same origin follow it, as they follow a key press.

### Pick mode

While pick mode is on, the element under the pointer on the slide shown, or within a few pixels of it, is outlined, even one that takes no pointer (`pointer-events: none`), and a click posts `dek:picked` for it without moving the deck. Pick mode stays on after a pick, for the next one, until `dek:pick` with `on: false`, or Escape pressed while the frame has the focus. The keys still move the deck, so the reader can pick on another slide.

### Pins

A pin is a small circle in dek's inspector blue with the mark's `number`, centred on the top right corner of its `box`. Pins are drawn on the slide their `slug` names whenever it is shown, at every step of it; `step` is kept with the mark for the page's own use. Clicking a pin posts `dek:mark` and moves nothing.
