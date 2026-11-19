---
name: dek-pptx
description: Build a finished dek deck again as a PowerPoint file the recipient edits as their own - every block of text one wrapping text box, boxes as grouped shapes, no picture of the slide behind them - with a script that writes the JSON `dekc pptx --from` turns into the file and checks. Use when a dek deck is done and someone wants it as an editable PPTX, a PowerPoint for a client, or a .pptx they will rework in their own template.
---

# dek-pptx

`dekc pptx` writes a file that looks exactly like the deck: PowerPoint's own text and boxes over a picture of everything else on the slide. People who rework the file in PowerPoint find that picture, and text cut into a box per line, in their way. This skill builds the file again the way a person would in PowerPoint, from what dek measured; dek writes and checks it. The look stays the deck's: its theme, fonts, and colors.

## First

- The deck is finished in dek: `bunx dekc lint --visual` passes. Fix the deck, not the PPTX, for anything the slides themselves get wrong.
- `bunx dekc help pptx` lists `spec` and `--from`. If it does not, the installed dek is too old for this skill: say so and stop.

## What dek gives you

`bunx dekc pptx <deck> spec --json` writes `.cache/pptx/` in the deck's folder:

- `spec.json`: per slide, its `slug`, `title`, `layout`, `notes`, `shot` (the slide as the browser drew it), and `outline`: its elements in reading order, nested as in the HTML. Each node has its box (`x`, `y`, `width`, `height`), its paint (`fill`, `border` or `sides`, `radius`, `outline`, `shadow`, `rotate`), `heading`, `decoration` for `aria-hidden`, and its `text`: `content`, every character it shows, with `\n` only for a `<br>`, `lines` as the browser broke it, and `runs` with size, weight, color, and the theme's font token. What `::before` and `::after` write, counters counted, is in `before` and `after`. A chip or pill inside a line of text is a node of its own.
- `parts/`, named by a node's `part`: an image or SVG drawn whole, and paint a shape cannot draw (a gradient, a clip-path, a pseudo-element's mark) drawn alone, without the elements and text inside it. The slide's own node's part is its background.
- `deck.pptx.json`: the file `dekc pptx` would write, as JSON, with the theme's colors and faces in `theme`. Its text is broken where the browser broke it: take text from the outline, and faces from here.
- `deck.pptx.schema.json`: every field the JSON may have. Read it before writing any.

Sizes are the slide's own pixels (1280 by 720 for 16:9), a color is `#rrggbb`, a font size is in pixels. Layers paint in order, the first at the back. What a layer leaves out takes its default.

## The loop

1. `bunx dekc pptx <deck> spec --json`.
2. Write a script beside the deck's `script.md`, `pptx.ts`, that reads `spec.json` and writes `pptx.json` in the deck's folder, slide by slide, by the rules below. The rules repeat across slides, so a script that applies them beats editing JSON by hand, and it is the source of the PPTX from now on: keep it with the deck.
3. `bunx dekc pptx <deck> --from <deck folder>/pptx.json --shot --json`. It writes `dist/<deck>.pptx`, returns `diagnostics`, and with `--shot`, on a Mac, `shots`: each slide as Quick Look draws the file.
4. Fix every error. Then every warning, unless you can name why the slide is right as it is. A diagnostic's `data` names what it found.
5. Open each of `shots` beside the slide's `shot` in `spec.json`, and fix what differs: a box too narrow for its text, a part laid where it does not belong, something missing.
6. Repeat 2 to 5.

Run `dekc pptx spec` again after any change to the deck, and on a fresh checkout, before `--from`: `pptx.json` names parts in `.cache/pptx/`, and `--from` says in `skipped` when `spec.json` is older than the deck.

## How a slide is set

- **Every block of text is one `prose` layer** at its node's box, with `wrap` left on: a heading, a paragraph, a list. Its text is the node's `content`, never a box per line.
- **The slide's `##` heading is the `prose` with `"title": true`**, outside any shape. PowerPoint lists the slide by it.
- **A list is one `prose`, a paragraph per item**, each with its `bullet`.
- **A box is a `shape`**: its fill, outline, and radius from the node, its text in its `text` so it moves with it. A box that holds other boxes or pictures holds them in its `layers`: a group in PowerPoint, so a card or a window moves as one. A circle is `"geometry": "ellipse"`; the schema lists the other shapes PowerPoint has.
- **Code is a `shape` with the panel's fill**, its text in the shape's `text`, a paragraph per line, in the theme's mono face, colored per run; a highlighted word's run has a `highlight`.
- **A picture is a `picture` of its node's `part`**, at the node's box: images, SVGs, and what a shape cannot draw. A part has no text in it; set the text over it as its own layer.
- **The slide's background is its `backdrop`**: the slide node's part, as the slide's background picture, not a picture laid over the slide. Without one, keep `background`.
- **Leave out the slide's `picture`**: everything it showed is now laid over the slide.
- **Faces:** a run's `font` and `ea` are copied from a run of `deck.pptx.json` in the same font token and weight. Colors are the outline's.
- **PowerPoint sets East Asian text wider** than the browser, which spaced it with the font's features. A box sized to its text, such as a pill or a one-line label, needs about a tenth more width; move what follows it on the row along.
- Keep every slide, in the deck's order, with its `slug`, and its `notes` from `spec.json`. Keep the words as the slide has them: the recipient rewrites them; you do not.

## When to stop

- `--from` reports no errors, and no warning you cannot name a reason for. A check in `skipped` did not run: run what its hint says.
- You have looked at every slide in `shots` beside its `shot`. Quick Look is not PowerPoint: it draws what the file says, but not always as PowerPoint would.
- Report what is left as a picture and why, and that the file was not opened in PowerPoint if it was not.
