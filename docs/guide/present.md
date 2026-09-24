# Presenting

While you work, the dev server keeps the browser in step with your files. At the venue, one HTML file is all you need. This page covers both, plus the presenter view, remote control from another device, and PDF export.

## The dev server

Run `dek` inside a deck to serve that deck. Run it at the project root to get an index of every deck.

```bash
dek
dek --visual
dek --port 3030
```

Without `--port`, the OS picks a free port and `dek` prints the URL. Fix it when another tool needs to know the address in advance.

On every save:

- **`script.md`** — a skeleton is generated for any new heading, orphaned HTML is flagged in the browser, and presenter notes refresh. If the deck has `voice/`, only the changed sentences are re-synthesized.
- **`slides/*.html`** — the changed slide is swapped in place, lint runs, and diagnostics appear both in the terminal and as an overlay in the browser.
- **`theme.css`** — every slide re-renders and the class vocabulary is re-resolved.
- **`slides/*.css`** — styles re-apply in place, and lint runs.
- **`slides/*.ts`** — the page reloads, because slide scripts register once at load, and lint runs.
- **`voice/voice.toml`** — the deck is re-timed from cached clips.
- With `--visual` and Playwright installed, the saved slide is also measured for overflow and contrast.

Only one server runs per project. A second `dek` finds the first one's lock in `.dek/server.json` and tells you where it is.

## The presenter view

Open `/presenter`, or press `p` in the player. You see the current slide, a preview of the next beat or slide, and the script for the current section with the current beat highlighted. Line breaks inside a paragraph are joined, so the script wraps to the presenter's width rather than your editor's; Japanese joins without a space. Stage directions, lists, and code keep their lines. A progress bar across the top tracks the whole deck. Along the bottom: the slide count, the budget for the current section, and the time elapsed since your first advance, which turns yellow past 80% of the talk's budget and red past 100%. Press `p` again to return to the audience view in the same window.

Every connected window follows the presenter over WebSocket: a second monitor, another laptop, or a phone.

```bash
dek goto architecture
dek current
```

While the server is running, the terminal can drive the browser and ask which slide is on screen. Agents use the same two commands.

## Keys

| Key | Action |
| --- | --- |
| `→` `PageDown` | Next beat, then next slide |
| `←` | Previous beat, then previous slide |
| `p` | Toggle the presenter view |
| `s` | Toggle the slide rail |
| `↑` `↓` | Move within the slide rail |
| `Space` | Play or pause during `dek rehearse` |

## The single file

```bash
dek build
```

You get `decks/<deck>/dist/<deck>.html`: every slide, the theme, the images as data URIs, and the player runtime, minified into one file. Open it in a browser and present. Use `--root-dist` to collect every deck's build under the project's `dist/`.

Build does four things: extracts each `<section class="slide">` and tags it with `data-slug`, minifies the theme, inlines `assets/` as data URIs, and embeds the runtime. It uses no external HTML minifier, so the output has one shape regardless of how the input was written. Build fails if any section is missing its HTML; run the dev server or `dek sync` first.

Open the file with `?presenter`, or press `p`, for the presenter view. A second window of the same file follows the first through `BroadcastChannel`: the audience view on the projector, the presenter view on your laptop, with no server and no network. The audience view has a slide rail on the left; click a thumbnail to jump, press `s` to hide it, and drag its edge to resize it. When the file opens, a short hint naming `s` and `p` fades in at the bottom and fades out on its own, or at the first key. The dev server does not show it, since it reloads on every save.

## Another device

Use the dev server at the venue only when you want to control the deck from another device, such as a phone as a remote.

```bash
dek --remote
dek --remote --password s3cret
```

This serves on the LAN. The presenter view, `goto`, and `current` are behind HTTP Basic authentication; the audience view is open. If you omit `--password`, dek generates one and prints it with the URLs.

The one file on a USB stick is the fallback that always works. Everything else is optional.

## PDF

```bash
dek pdf
```

Renders every slide at its last beat into `dist/<deck>.pdf`. Requires Playwright.

## Next

Add narration and turn the deck into a video: [Voice and Video](./voice). If a live talk is all you need, skip to [Working with AI Agents](./ai).
