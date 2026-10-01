# Presenting

While you work, the dev server keeps the browser in step with your files. At the venue, one HTML file is all you need. This page covers both, plus the presenter view, remote control from another device, and PDF export.

## The dev server

Run `dekc` inside a deck to serve that deck. Run it at the project root to get an index of every deck.

```bash
dekc
dekc --visual
dekc --port 3030
```

Without `--port`, the OS picks a free port and `dekc` prints the URL. Fix it when another tool needs to know the address in advance.

On every save:

- **`script.md`** — a skeleton is generated for any new heading, orphaned HTML is flagged in the browser, and presenter notes refresh. If the deck has `voice/`, only the changed sentences are re-synthesized.
- **`slides/*.html`** — the changed slide is swapped in place, lint runs, and diagnostics appear both in the terminal and as an overlay in the browser.
- **`theme.css`** — every slide re-renders and the class vocabulary is re-resolved.
- **`slides/*.css`** — styles re-apply in place, and lint runs.
- **`slides/*.ts`** — the page reloads, because slide scripts register once at load, and lint runs.
- **`voice/voice.toml`** — the deck is re-timed from cached clips.
- With `--visual` and Playwright installed, the saved slide is also measured for overflow and contrast.

Only one server runs per project. A second `dekc` finds the first one's lock in `.dekc/server.json` and tells you where it is.

## The presenter view

Open `/presenter`, or press `p` in the player. You see the current slide, a preview of the next beat or slide, and the script for the current section with the current beat highlighted. Line breaks inside a paragraph are joined, so the script wraps to the presenter's width rather than your editor's; Japanese joins without a space. Stage directions, lists, and code keep their lines. A progress bar across the top tracks the whole deck. Along the bottom: the slide count, the budget for the current section, and the time elapsed since your first advance, which turns yellow past 80% of the talk's budget and red past 100%. Press `p` again to return to the audience view in the same window.

Every connected window follows the presenter over WebSocket: a second monitor, another laptop, or a phone. A window whose connection drops, because the server restarted or the Wi-Fi blinked, reconnects on its own and catches up with the slide on screen; a move made on it while it was offline is sent once it is back.

```bash
dekc goto architecture
dekc current
```

While the server is running, the terminal can drive the browser and ask which slide is on screen. Agents use the same two commands.

## Keys

| Key | Action |
| --- | --- |
| `→` `PageDown` `Space` | Next beat, then next slide |
| `←` `PageUp` `Backspace` `Shift+Space` | Previous beat, then previous slide |
| `Home` `End` | The first slide as it arrives, the last beat of the last slide |
| `p` | Toggle the presenter view |
| `s` | Toggle the slide rail |
| `f` | Toggle fullscreen |
| `l` | Toggle the laser pointer |
| `m` | Mark the beat on screen to rewrite, or unmark it (dev server) |
| `↑` `↓` | Move within the slide rail |
| `←` `→` on the rail's edge | Resize the rail |
| `Space` | Play or pause during `dekc rehearse` |

Every press counts. Pressing faster than the transitions play, as a clicker skipping ahead does, cuts each transition short and lands where the presses add up to; a second window follows each press at once. Keys held with `Alt`, `Ctrl`, or `Cmd` belong to the browser, and keys typed into a field on a slide belong to the field.

Tap or click the slide to go forward, and its left third to go back. On a phone or tablet you can also swipe sideways; a mouse drag selects text instead, and a click that ends a selection, a right click, or a click held with a modifier key stays where it is. Taps and clicks on links, buttons, and fields are theirs. The slide rail and the key hint stay out of the way on a narrow or touch screen.

Press `l`, or the round button at the end of the presenter view's bar, for a laser pointer. Where the mouse or a finger rests on the slide, a red dot shows in every window of the deck, at the same place on the slide whatever the window's size: the projector, the presenter view, and a phone. While the laser is on, the slide is for pointing, so a tap or a click on it moves nothing; the keys still do. The dot goes when the pointer leaves the slide, the finger lifts, the deck moves to another slide, or the laser is turned off, and on its own a few seconds after its window stops saying where it is, so a closed laptop leaves no dot on the projector. On the dev server only the presenter may point: a laser in an audience window shows on that window alone. A video and a PDF have no dot.

Rehearsing aloud on the dev server, press `m`, or the pencil button in the presenter view's bar, on a beat whose words you stumble over. The beat gets a pencil in the beat list, and the mark is kept in `.dekc/marks.json` until you clear it. Afterwards `dekc marks` lists each marked beat with its line in `script.md` and what it said, for you or an agent to rewrite; see [After a rehearsal](./ai#after-a-rehearsal). A built file has no server to keep marks, so it has no button.

The URL follows the deck: `#<slug>` for a slide, `#<slug>/<n>` for its nth beat. Each slide is one history entry, so Back leaves the slide rather than stepping back through its beats. A beat number past the slide's last opens at the last beat and rewrites the URL to say so.

## The single file

```bash
dekc build
```

You get `decks/<deck>/dist/<deck>.html`: every slide, the theme, the images as data URIs, and the player runtime, minified into one file. Open it in a browser and present. Use `--root-dist` to collect every deck's build under the project's `dist/`.

Build does four things: extracts each `<section class="slide">` and tags it with `data-slug`, minifies the theme, inlines `assets/` as data URIs, and embeds the runtime. It uses no external HTML minifier, so the output has one shape regardless of how the input was written. A section with no HTML yet is built from the skeleton `dekc sync` would write, and lint's `DEKC001` says so; a build never stops on lint.

Open the file with `?presenter`, or press `p`, for the presenter view. A second window of the same file follows the first through `BroadcastChannel`: the audience view on the projector, the presenter view on your laptop, with no server and no network. Another deck's file open at the same time does not follow. The audience view has a slide rail on the left; click a thumbnail to jump, press `s` to hide it, and drag its edge to resize it. When the file opens, a short hint naming `s` and `p` fades in at the bottom and fades out on its own, or at the first key. The dev server does not show it, since it reloads on every save.

## On the web

The same file works on any static host. For a shared link to show a card with the title, description, and a picture, tell dekc where `dist/` is served from:

```toml
# dekc.toml
url = "https://example.com/talks/"
```

The build then writes Open Graph and Twitter card tags into the page, and the first slide, at its last beat, as `dist/<deck>.png` beside it. Upload both. `og:url` and `og:image` are that URL plus each file name, because crawlers fetch only an absolute image URL. The title comes from the frontmatter `title`, and the description from `description`, or from `event` and `date` when there is none. Taking the picture needs Playwright; without it, or without a URL, the page still gets its title and description, and the build output says what is missing.

A host that makes a new URL for each deploy, such as a preview deployment, cannot be named in `dekc.toml`. Pass it at build time instead, from whatever variable the host sets, since `--url` wins over `dekc.toml`:

```bash
dekc build --root-dist --url "https://$DEPLOY_HOST/"
```

When the URL is only known after the upload, there is no absolute address to put in the page, and a shared link shows the title and description without the picture.

A build is the file you present from, so its presenter view carries the whole script, a URL or not. A page for anyone who has the link is `dekc build --public`: its presenter view carries only what you say aloud, with the stage directions (blockquotes) and HTML comments in `script.md` left out, and code blocks kept as written. Build it `--public` before you put it on the web, and present from a build without it, or from the dev server.

To print, use the browser's own Print: every slide gets a page of its own at the deck's size and in its own layout, with every beat shown, each slide script drawn at its last beat, and no rail or hint. `dekc pdf` writes the same pages without a dialog.

## Another device

Use the dev server at the venue only when you want to control the deck from another device, such as a phone as a remote.

```bash
dekc --remote
```

This serves on the LAN. Everything made from the script is behind HTTP Basic authentication: the presenter view, `goto` and `current`, the voice timeline and audio, and the lint diagnostics the dev server streams. The audience view, the slides, and their assets are open. dekc makes a new 10-letter password each time and prints it with the URLs; when the browser asks, enter any user name and that password. You cannot choose the password, so none is ever weak, empty, or left in your shell history.

To skip typing it on a phone, scan the QR code dekc prints under the password: it opens the presenter view signed in. The code in it works once and for five minutes, so a photo of a projected terminal is useless by the time anyone tries it. Press Enter in the terminal for a new code for the next device. With several decks, the code opens the deck list, where each deck has a presenter link. The phone stays signed in until the server stops.

The server answers only to its IP addresses and this machine's own name, so a web page cannot reach it under a name of its own (DNS rebinding). `dekc <deck> --remote` shares that deck and no other deck in the project. The password travels over plain HTTP, so use a network you trust.

The one file on a USB stick is the fallback that always works. Everything else is optional.

## PDF

```bash
dekc pdf
```

Renders every slide at its last beat into `dist/<deck>.pdf`. Requires Playwright.

## Next

Add narration and turn the deck into a video: [Voice and Video](./voice). If a live talk is all you need, skip to [Working with AI Agents](./ai).
