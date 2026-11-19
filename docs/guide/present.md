---
description: 'Dev server, presenter view, keys and touch, marks and annotations, one file on a USB stick, print, remote, PDF, and PPTX with editable text and shapes.'
---

# Presenting

While you work, the dev server keeps the browser in step with your files. At the venue, one HTML file is all you need. This page covers both, plus the presenter view, remote control from another device, and PDF and PPTX export.

## The dev server

Run `dekc` inside a deck to serve that deck. Run it at the project root to get an index of every deck.

```bash
dekc
dekc --visual
dekc --port 3030
```

Without `--port`, the OS picks a free port and `dekc` prints the URL. Fix it when another tool needs to know the address in advance.

Open the URL in a browser tab. The dev server lets no page of another origin show it in a frame, so an editor preview that frames the page, such as VS Code's Simple Browser, stays blank.

On every save:

- **`script.md`** — a skeleton is generated for any new heading, orphaned HTML is flagged in the browser, and presenter notes refresh. If the deck has `voice/`, only the changed sentences are re-synthesized.
- **`slides/*.html`** — the changed slide is swapped in place, lint runs, and diagnostics appear both in the terminal and as an overlay in the browser.
- **`theme.css`** — every slide re-renders and the class vocabulary is re-resolved.
- **`slides/*.css`** — styles re-apply in place, and lint runs.
- **`slides/*.ts`** — the page reloads, because slide scripts register once at load, and lint runs.
- **`voice/voice.toml`** — the deck is re-timed from cached clips.
- With `--visual` and Playwright installed, the saved slide is also measured for overflow, contrast, line breaks, and alignment.

Only one server runs per project. A second `dekc` finds the first one's lock in `.dek/server.json` and tells you where it is.

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
| `/` | Search every slide |
| `l` | Toggle the laser pointer |
| `m` | Mark the beat on screen to rewrite, or unmark it (dev server) |
| `a` | Toggle annotate mode (dev server) |
| `↑` `↓` | Move within the slide rail |
| `←` `→` on the rail's edge | Resize the rail |
| `Space` | Play or pause during `dekc rehearse` |

Every press counts. Pressing faster than the transitions play, as a clicker skipping ahead does, cuts each transition short and lands where the presses add up to; a second window follows each press at once. Keys held with `Alt`, `Ctrl`, or `Cmd` belong to the browser, and keys typed into a field on a slide belong to the field.

Tap or click the slide to go forward, and its left third to go back. On a phone or tablet you can also swipe sideways; a mouse drag selects text instead, and a click that ends a selection, a right click, or a click held with a modifier key stays where it is. Taps and clicks on links, buttons, and fields are theirs. The slide rail and the key hint stay out of the way on a narrow or touch screen.

Press `l`, or the round button at the end of the presenter view's bar, for a laser pointer. Where the mouse or a finger rests on the slide, a red dot shows in every window of the deck, at the same place on the slide whatever the window's size: the projector, the presenter view, and a phone. While the laser is on, the slide is for pointing, so a tap or a click on it moves nothing; the keys still do. The dot goes when the pointer leaves the slide, the finger lifts, the deck moves to another slide, or the laser is turned off, and on its own a few seconds after its window stops saying where it is, so a closed laptop leaves no dot on the projector. On the dev server only the presenter may point: a laser in an audience window shows on that window alone. A video and a PDF have no dot.

Rehearsing aloud on the dev server, press `m`, or the pencil button in the presenter view's bar, on a beat whose words you stumble over. The beat gets a pencil in the beat list, and the mark is kept in `.dek/marks.json` until you clear it. Afterwards `dekc marks` lists each marked beat with its line in `script.md` and what it said, for you or an agent to rewrite; see [After a rehearsal](./ai#after-a-rehearsal). A built file has no server to keep marks, so it has no button.

To tell an agent which element to change, press `a` on the dev server, or the ⌖ button in the presenter view's bar, and point at it. The element under the pointer is outlined with its line in `slides/<slug>.html`. Click to pick it, or hold Cmd or Ctrl and click to pick more for one note. The popup opens beside what you picked, never over it, and while Cmd or Ctrl is held it lets clicks through to whatever it lies over. The popup lists everything under and near the click, such as the text, the chevron around it, and the lane, each before what it is in. Click the one you mean, write what should change, and press Enter. A shape that takes no pointer (`pointer-events: none`) can be picked, a step not shown yet cannot, and a click on empty space notes that place on the slide. Each note gets a numbered marker; click it to change or delete the note. The count beside **Copy** lists every note, by slide and beat as Copy groups them; click one to go to its slide and open it there. A note whose element an edit took away has no marker, and opens from this list. **Copy** puts every note in one block of text to paste to an agent; see [Pointing goes both ways](./ai#pointing-goes-both-ways). The dev server keeps the notes in `.dek/annotations.json` until you clear them, so they last through reloads and restarts, and every tab and device annotating the deck shows the same ones. When an edit moves an element, its note follows it, and `dekc annotations` lists them for an agent to read without asking you to copy. Clearing them can be undone from the bar until you write another note or leave the mode. Nothing of the mode shows while it is off, and only the speaker's pages have it: an audience page on the LAN, a build, and a video do not. On the LAN address, where the browser gives the page no clipboard, Copy shows the text selected for you to copy.

Press `/` to search the whole deck: the words on every slide, steps not shown yet included, each slide's title, and its script where the file carries one. Each slide that says the words is listed with its number, its title and a quote around a match; full- and half-width forms match, and spaces and line breaks are passed over. Move through the list with `↑` `↓`, and press `Enter` or click one to go to the beat that shows the words, which are highlighted on the slide until you leave it. `Esc`, the × button, or a click outside closes the search; in full screen the first `Esc` leaves full screen. It works the same in a deck framed by another page, such as dek.pub's viewer.

The URL follows the deck: `#<slug>` for a slide, `#<slug>/<n>` for its nth beat. Each slide is one history entry, so Back leaves the slide rather than stepping back through its beats. A beat number past the slide's last opens at the last beat and rewrites the URL to say so.

## The single file

```bash
dekc build
```

You get `decks/<deck>/dist/<deck>.html`: every slide, the theme, the images as data URIs, and the player runtime, minified into one file. Open it in a browser and present. Use `--root-dist` to collect every deck's build under the project's `dist/`.

Build does four things: extracts each `<section class="slide">` and tags it with `data-slug`, minifies the theme, inlines `assets/` as data URIs, and embeds the runtime. It uses no external HTML minifier, so the output has one shape regardless of how the input was written. A section with no HTML yet is built from the skeleton `dekc sync` would write, and lint's `DEK001` says so; a build never stops on lint.

Open the file with `?presenter`, or press `p`, for the presenter view. A second window of the same file follows the first through `BroadcastChannel`: the audience view on the projector, the presenter view on your laptop, with no server and no network. Another deck's file open at the same time does not follow. The audience view has a slide rail on the left; click a thumbnail to jump, press `s` to hide it, and drag its edge to resize it. When the file opens, a short hint naming `s`, `/` and `p` fades in at the bottom and fades out on its own, or at the first key. A file built with `--no-script` has no presenter view, and its hint names only `s` and `/`; a file shown in another page's frame shows no hint and starts with the rail closed. The dev server does not show it, since it reloads on every save.

## On the web

The same file works on any static host. For a shared link to show a card with the title, description, and a picture, tell dek where `dist/` is served from:

```toml
# dek.toml
url = "https://example.com/talks/"
```

The build then writes Open Graph and Twitter card tags into the page, and the first slide, at its last beat, as `dist/<deck>.png` beside it. Upload both. `og:url` and `og:image` are that URL plus each file name, because crawlers fetch only an absolute image URL. The title comes from the frontmatter `title`, and the description from `description`, or from `event` and `date` when there is none. Taking the picture needs Playwright; without it, or without a URL, the page still gets its title and description, and the build output says what is missing.

A host that makes a new URL for each deploy, such as a preview deployment, cannot be named in `dek.toml`. Pass it at build time instead, from whatever variable the host sets, since `--url` wins over `dek.toml`:

```bash
dekc build --root-dist --url "https://$DEPLOY_HOST/"
```

When the URL is only known after the upload, there is no absolute address to put in the page, and a shared link shows the title and description without the picture.

A build is the file you present from, so its presenter view carries the whole script, a URL or not. A page for anyone who has the link is `dekc build --public`: its presenter view carries only what you say aloud, with the stage directions (blockquotes) and HTML comments in `script.md` left out, and code blocks kept as written. Build it `--public` before you put it on the web, and present from a build without it, or from the dev server.

To print, use the browser's own Print: every slide gets a page of its own at the deck's size and in its own layout, with every beat shown, each slide script drawn at its last beat, and no rail or hint. `dekc pdf` writes the same pages without a dialog, drawn so that they look the same in every PDF viewer (see [PDF](#pdf)).

## Another device

Use the dev server at the venue only when you want to control the deck from another device, such as a phone as a remote.

```bash
dekc --remote
```

This serves on the LAN. Everything made from the script is behind HTTP Basic authentication: the presenter view, `goto` and `current`, the voice timeline and audio, and the lint diagnostics the dev server streams. The audience view, the slides, and their assets are open. dek makes a new 10-letter password each time and prints it with the URLs; when the browser asks, enter any user name and that password. You cannot choose the password, so none is ever weak, empty, or left in your shell history.

To skip typing it on a phone, scan the QR code dek prints under the password: it opens the presenter view signed in. The code in it works once and for five minutes, so a photo of a projected terminal is useless by the time anyone tries it. Press Enter in the terminal for a new code for the next device. With several decks, the code opens the deck list, where each deck has a presenter link. The phone stays signed in until the server stops.

The server answers only to its IP addresses and this machine's own name, so a web page cannot reach it under a name of its own (DNS rebinding). A page on another site open in the same browser cannot play the voice, apply the theme, or show the presenter view in a frame, even once the browser has the password. `dekc <deck> --remote` shares that deck and no other deck in the project. The password travels over plain HTTP, so use a network you trust.

The one file on a USB stick is the fallback that always works. Everything else is optional.

## PDF

```bash
dekc pdf
```

Renders every slide at its last beat into `dist/<deck>.pdf`. Requires Playwright.

Each page is a picture of the slide as the browser drew it, at twice the slide's size, with the slide's text laid over it, unseen: a reader selects, searches, and copies the text where they see it, and links still work. A PDF printed as vectors can look different in another viewer: Chromium writes a blurred `box-shadow` and a gradient clipped with `background-clip: text` in a way that Preview, Quick Look, Safari, and iPhone and iPad draw as flat boxes. A picture looks the same everywhere. A slide is kept as a PNG, so type and shapes keep their edges; one that shows photographs, a tenth of its area or more, is kept as a JPEG at quality 90 when that is smaller. In exchange, the type softens when zoomed in far, and the file is larger than a vector one, about a picture per slide.

The browser's own Print still prints vectors, so a PDF saved from its dialog can show those boxes in Apple's viewers. Hand over the one `dekc pdf` writes.

## PPTX

```bash
dekc pptx
dekc pptx --public
```

Writes `dist/<deck>.pptx` for someone who works in PowerPoint or Keynote: an organizer collecting slides, a co-presenter, a company template, a recipient who has to keep editing the deck. Each `##` is one slide, at its last beat, as the PDF prints it, and its script is in the notes; `--public` leaves out the stage directions and comments, as `dekc build --public` does. Requires Playwright.

The browser draws each slide, as for the PDF, and what PowerPoint can draw exactly comes out of that drawing as PowerPoint's own:

- **A box with no more than a color, a solid border, and round corners is a shape.** A card, a chip, a cell of a table drawn as a grid of boxes. A border that differs per side, such as a row's rule, is a line per side.
- **Each `<img>`, `<canvas>`, and outermost `<svg>` is a picture of its own** when it is upright and nothing cuts it off, drawn alone on a transparent ground with its shadow and outline. An inline SVG comes as itself too, its theme colors written in, so PowerPoint can turn it into shapes; one the file would draw otherwise comes as its picture alone: an SVG with padding or a border, under a filter or a clip, or styled by CSS its attributes cannot say.
- **What a shape holds is grouped with it**, so a card moves with its icon and its words.
- **Text in a shape is the shape's**, in paragraphs, when its blocks stand one under another. A list's disc, circle, square, or decimal marker is the paragraph's bullet. The text is set from the top, where the browser set it; text a flexbox or a grid centers is centered.
- **Any other block of text is a text box of its own**, as wide as the block, and a list's items are one text box, an item a paragraph. The slide's highest heading is its title, which PowerPoint lists the slide by; a number or a mark that `::before` sets before the heading's words is not part of it.
- **A paragraph is broken where the browser broke it.** Each line ends in PowerPoint's own line break, so a line that ends on a phrase still does. What is typed into a text wraps at its width where every line had room in it; a chip drawn to its text's width does not wrap.
- **Text that is not plain lines is a text box a line**, where the browser set it: a line with a chip in it, lines at uneven pitch, a code block whose lines are indented.
- **What `::before` and `::after` write is text too**, a folio or a running head, with its counters counted. A slide's number is the digits the browser drew, and does not count again when the slide is moved.
- **Each character stands where the browser put it.** PowerPoint applies no OpenType feature, so the proportional kana and punctuation `font-feature-settings: "palt"` sets and the punctuation the browser halves where two marks meet are written as character spacing, character by character where they differ. Kerning between Latin letters is left to PowerPoint.
- **The theme's tokens are PowerPoint's theme.** `--fg`, `--bg`, `--muted`, and `--accent` fill the color scheme's Dark 1, Light 1, Dark 2, and Accent 1; `--font-title` and `--font-body` are its heading and body fonts, each named by the face most of the text set in it was drawn in. A shape, line, or run in a token's color, and text in a font token drawn in that face, refers to the theme, so a new color or font scheme in the Design tab restyles them.
- **The slide's background is PowerPoint's** when it is one color, or a linear gradient running straight across or down, in sRGB colors: the master's when it is `--bg`, the slide's own otherwise. Under a background image, a texture, or rules drawn with gradients, the color is PowerPoint's all the same, and only what is drawn over it stays in the picture; a soft glow that would make the picture much larger without its color keeps the background in the picture whole.

**Everything else is a picture** under them, at twice the slide's size, on nothing when the background is PowerPoint's; a slide with nothing left in it has no picture at all. That is what PowerPoint cannot draw as the browser did: a gradient, a shadow, a filter, a background image or texture, a box or a shadow a pseudo-element draws, a list marker PowerPoint has no bullet for, decoration under `aria-hidden` that is not a picture, text a transform rotates, every text's shadow, what a negative `z-index` puts beneath, a custom element. A box stays in the picture too whenever laying it over would cover something that stays drawn, or lay it over or under another in an order the browser may not have painted them in: a card with a gradient highlight in it, or a bullet drawn with `::before`, stays a picture with its text over it. Write highlights as plain colors and bullets as list markers for such a card to become a shape.

The output says what each file got, and names each slide where nothing came out of the picture, the ones to rewrite toward plain boxes if they must be edited. `--json` returns `outs` alone.

```text
wrote dist/talk.pptx
  laid 19 shapes and 4 pictures over the picture; nothing on cover, close
```

Each text names the fonts Chromium drew it with, one for its Latin and one for its East Asian characters, or the theme's fonts for a font token; the file embeds none. A recipient without a font sees PowerPoint's substitute in the same place, spaced for the font it stands in for: a line in a text box of its own runs a little longer or shorter, and a paragraph that wraps can break a line again. Where a family has more weights than a regular and a bold, as Hiragino Sans has W0 to W9, the name is the face's own, "Hiragino Sans W6": PowerPoint and Quick Look take such a family's regular and bold to be different faces, and neither takes them to be the ones Chromium drew. Text set in a font token at another weight than most of it, a bold word in a paragraph, names its face too and does not change with the theme's font. Bold pressed in PowerPoint on text in such a face thickens that face; the family's heavier face is chosen in the font menu. Text meant to be edited belongs in HTML, not in an SVG. The alternative text of each picture is its own `alt`, `aria-label`, or `<title>`, which `DEK034` asks for, and the slide's picture carries those of what stays in it.


### Build it again to edit

```bash
dekc pptx spec
dekc pptx --from decks/talk/pptx.json --shot
```

The file `dekc pptx` writes looks like the deck, and keeps a picture of what PowerPoint cannot draw under its shapes and text. A recipient who reworks the deck in their own PowerPoint, in their own template, wants none of it there: each block of text one box that wraps, each box a shape with its text in it, nothing behind them. Building that takes judgment about each slide, so dek leaves it to an agent, gives it what dek measured, and checks what it built. The optional skill `dek-pptx` teaches an agent the loop ([Working with AI Agents](/guide/ai)).

`dekc pptx spec` writes `.cache/pptx/` in the deck's folder: `deck.pptx.json`, the file `dekc pptx` would write as JSON, with its schema beside it; `spec.json`, each slide's elements in reading order with their boxes, paint, and text, where each stretch of each line lies, a table's grid and each cell's place on it, its shot, and its notes; and `parts/`, each image and each part no shape can draw, such as a gradient or a clip-path, drawn alone without its text. The agent writes the deck as that JSON, usually with a script that reads `spec.json`.

`dekc pptx --from <file>` writes the JSON as `dist/<deck>.pptx`, in the deck's theme, its slides' titles PowerPoint's, a table PowerPoint's own table, whose cells a recipient retypes and whose rows grow to hold their text, a background picture every slide shares on the slide master, and checks it against `spec.json`:

| id | severity | finds |
| --- | --- | --- |
| `pptx-slides` | error | slides missing, added, or out of order |
| `pptx-title` | error | a slide with no title, with two, or with one that holds no text |
| `pptx-text` | error | a text the slide shows that the file does not hold |
| `pptx-bounds` | error | a layer past the slide's edge |
| `pptx-place` | warning | a text set away from where the slide shows it |
| `pptx-fit` | warning | a one-line text in a box narrower than PowerPoint, setting it wider, needs |
| `pptx-picture` | warning | a picture of the slide left behind, or one over most of it |
| `pptx-lines` | warning | text set a line a box |
| `pptx-notes` | warning | empty notes on a slide the script speaks to |

The JSON holds no chart yet: a chart stays a picture of its part. An error fails it, as lint's do, and the file is written all the same. When `spec.json` is missing or older than the deck, nothing is checked and `skipped` says to run `dekc pptx spec` again. `--shot` draws each slide of the file with Quick Look, on a Mac, and sets it beside the browser's shot in one picture, what differs tinted red, with how far apart the two are; Quick Look is not PowerPoint, so open the file before you hand it over.

## Next

Add narration and turn the deck into a video: [Voice and Video](./voice). If a live talk is all you need, skip to [Working with AI Agents](./ai).
