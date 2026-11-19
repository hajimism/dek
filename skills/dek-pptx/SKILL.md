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

- `spec.json`: per slide, its `slug`, `title`, `layout`, `notes`, `shot` (the slide as the browser drew it), and `outline`: its elements in reading order, nested as in the HTML. Each node has its box (`x`, `y`, `width`, `height`), its paint (`fill`, `border` or `sides`, `radius`, `padding`, `outline`, `shadow`, `rotate`), `heading`, `decoration` for `aria-hidden`, and its `text`:
  - `content`: every character it shows, with `\n` only for a `<br>`; `lines`, as the browser broke it; `align`, where the lines sit, a flexbox's centering included.
  - `runs`: size, weight, color, `letterSpacing`, the theme's font token, and `face`, the faces the browser drew it in, to copy into a run's `font` and `ea`.
  - `widen`: how much wider PowerPoint sets the text than the browser did, which spaced it with the font's features. 1.08 is 8% wider.
  - What `::before` and `::after` write, counters counted, is a node of its own, `::before` or `::after`, with its box and run.
  - A chip or pill inside a line is a node with `inline`, for its box; its text is the line's.
- `parts/`, named by a node's `part`: an image or SVG drawn whole, and paint a shape cannot draw drawn alone, without the elements and text inside it; `drawn` says what that paint is (`gradient`, `clip-path`, `::before`, …). The slide's own node's part is its background. A part that is only a pseudo-element's dot or bar is often simpler as a small shape.
- `deck.pptx.json`: the file `dekc pptx` would write, as JSON, with the theme's colors and faces in `theme`. Its text is broken where the browser broke it: take text from the outline, and faces from here.
- `deck.pptx.schema.json`: every field the JSON may have. Read it before writing any.

Sizes are the slide's own pixels (1280 by 720 for 16:9), from the slide's top left corner, inside a group as well as outside; a color is `#rrggbb`; a font size and a radius are in pixels. Layers paint in order, the first at the back. What a layer leaves out takes its default. A shape's text is set from its top.

## The loop

1. `bunx dekc pptx <deck> spec --json`.
2. Write a script beside the deck's `script.md`, `pptx.ts`, that reads `spec.json` and writes `pptx.json` in the deck's folder, slide by slide, by the rules below. The rules repeat across slides, so a script that applies them beats editing JSON by hand, and it is the source of the PPTX from now on: keep it with the deck.
3. `bunx dekc pptx <deck> --from <deck folder>/pptx.json --shot --json`. It writes `dist/<deck>.pptx`, returns `diagnostics`, and with `--shot`, on a Mac, `shots`: per slide, `compare`, one picture with the browser's slide on the left and the file's on the right, what differs tinted red, and its `difference`, 0 to 255.
4. Fix every error. Then every warning, unless you can name why the slide is right as it is. A diagnostic's `data` names what it found.
5. Open the `compare` of the slides with the largest `difference` first, and fix what differs: a line that wrapped, a box too narrow for its text, a part where it does not belong, something missing. Text a little off its place tints red too; look for whole words and boxes.
6. Repeat 2 to 5.

Run `dekc pptx spec` again after any change to the deck, and on a fresh checkout, before `--from`: `pptx.json` names parts in `.cache/pptx/`, and `--from` says in `skipped` when `spec.json` is older than the deck.

## How a slide is set

- **Every block of text is one `prose` layer** at its node's box, with `wrap` left on: a heading, a paragraph, a list. Its text is the node's `content`, never a box per line.
- **The slide's `##` heading is the `prose` with `"title": true`**, outside any shape. PowerPoint lists the slide by it.
- **A list is one `prose`, a paragraph per item**, each with its `bullet`.
- **A box is a `shape`**: its fill, outline (`dash` for a dashed border), radius, and `shadow` from the node, its text in its `text` so it moves with it, inset by the node's `padding`. A box that holds other boxes or pictures holds them in its `layers`: a group in PowerPoint, so a card or a window moves as one. A circle is `"geometry": "ellipse"`; the schema lists the other shapes PowerPoint has. A turned node is a shape or picture with its `rotate`.
- **Code is a `shape` with the panel's fill**, its text in the shape's `text`, a paragraph per line, in the theme's mono face, colored per run; a highlighted word's run has a `highlight`.
- **A picture is a `picture` of its node's `part`**, at the node's box: images, SVGs, and what a shape cannot draw. A part has no text in it; set the text over it as its own layer.
- **The slide's background is its `backdrop`**: the slide node's part, as the slide's background picture, not a picture laid over the slide. Without one, keep `background`.
- **Leave out the slide's `picture`**: everything it showed is now laid over the slide.
- **Faces:** a run's `font` and `ea` are its `face` in the outline, `latin` and `ea`, and `ea` is `latin` when the face has none of its own; where a run has no `face`, take a run's of the same font token and weight. Colors are the outline's; a run's `background` is its `highlight`.
- **Width:** PowerPoint sets the text `widen` times as wide. A box that wraps keeps its width; a box sized to its text is `widen` times as wide, and what follows it on its row moves along by the difference. A box is sized to its text when its `text.lines` is 1 and its width is about its text's, as a pill's, a chip's, a label's, or a heading's that must keep its lines are.
- Keep every slide, in the deck's order, with its `slug`, and its `notes` from `spec.json`. Keep the words as the slide has them: the recipient rewrites them; you do not.

## When to stop

- `--from` reports no errors, and no warning you cannot name a reason for. A check in `skipped` did not run: run what its hint says.
- You have looked at every slide's `compare`. Quick Look is not PowerPoint, and draws some of the file other than PowerPoint does: in a group it paints pictures above shapes, whatever their order; a picture in a group covers what is under it there; it drops the spaces that start a line and empty lines; it draws no `highlight`; it wraps text the file says not to; its colors come out a little lighter. Do not change the file for these.
- Report what is left as a picture and why, and that the file was not opened in PowerPoint if it was not.
