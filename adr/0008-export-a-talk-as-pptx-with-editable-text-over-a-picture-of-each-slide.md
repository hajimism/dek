# 8. Export a talk as PPTX with editable text over a picture of each slide

Date: 2026-10-06

## Status

Accepted

## Context

A talk often has to reach people who work in PowerPoint or Keynote: an organizer who collects every speaker's slides, a co-presenter, a company that keeps decks in its own template. dek hands over a single HTML file, a PDF, and a video, none of which they can edit. Slidev and open-slide export PPTX with native shapes and text boxes; Marp exports pictures, with an experimental editable mode through LibreOffice. `docs/guide/why.md` and the FAQ listed PPTX export among what dek is not for.

dek is unusually easy to convert. A slide is one `<section class="slide">` of plain HTML and CSS, with no inline style and values through tokens, and its words to say are the script, which belongs in the notes pane. What a slide shows at the end of each beat is already drawn for the PDF and for shots, on a still page per slide, in the Playwright worker.

What it is not easy to convert is CSS itself. open-slide maps backgrounds, borders, radii, gradients, shadows, and simple SVG onto PowerPoint shapes in about 3,700 lines, and falls back to pictures where PowerPoint has no equivalent. That is a second renderer to keep in step with the browser, for one maintainer, and its fallbacks decide element by element what stays editable.

The text is what a recipient edits: a typo, a date, a name, a translation. A picture keeps everything else exact, and Chromium already draws it.

## Decision

**dek exports PPTX.** `why.md` and the FAQ now say a WYSIWYG editor and Keynote's own format are out, not PPTX.

**`dekc pptx [deck]`, a sibling of `dekc pdf`.** One `<deck>.pptx` per deck in the deck's `dist/`, or the project's with `--root-dist`; `--json` returns `outs`, the same shape as `pdf`. It needs Playwright and fails with the install command when it is missing, as `pdf` does. A slide script that cannot run stops it, as it stops `pdf` and `video`: a file handed to someone else must not be missing a slide's motion's end.

**Each slide at its last beat, one PowerPoint slide per `##`,** as the PDF prints it. A slide per beat would turn a handout into a flipbook, and PowerPoint's animations cannot express CSS transitions and view transitions faithfully; neither is offered.

**Text is editable; everything else is a picture.** Each slide is drawn on its still page at twice the logical size. Every text node in the slide's HTML flow is measured where the browser laid it out, line by line, and then hidden from the drawing with the CSS Custom Highlight API, which changes no layout. The drawing without that text becomes the slide's background picture, and each line of text becomes a text box at the same place: no wrapping, no insets, the browser's line breaks, its size, weight, style, color with its opacity, letter spacing, and underline or strike. Pieces of one line that sit together form one box with a run for each piece; a gap wider than a space, such as a chip's padding, starts another box.

What stays in the picture, and is not editable, by design and not by fallback:

- SVG, its `<text>` included: a diagram is drawn as a whole;
- anything under `aria-hidden="true"`: decoration;
- text a `::before` or `::after` draws, such as a folio or a running head;
- text under a transform that rotates or skews it;
- text whose fill is transparent, as gradient text is;
- a text's shadow or glow, which stays beneath the editable text where it was drawn.

There is no per-element diagnostic: the line is the same on every slide and is documented, and nothing is "lost" to a fallback.

**Fonts are named, not embedded.** Each run names the font Chromium actually drew it with, read through the DevTools protocol (`CSS.getPlatformFontsForNode`), since the default theme says only `sans-serif`. Embedding would ship font files whose licenses dek cannot judge, and PowerPoint's embedding is unreliable across platforms. A recipient without the font sees PowerPoint's substitute; because every line is broken where the browser broke it and boxes do not wrap, a wider substitute runs a line longer but never reflows the slide.

**The notes are the script, as `build` treats it.** Each slide's notes pane holds what the presenter view shows: its paragraphs, beat by beat. A PPTX is a file for other people, so `--public` leaves out the stage directions and HTML comments, exactly as `build --public` does; without it the notes are the speaker's, as a co-presenter needs them.

**No dependency.** The package is a ZIP of OOXML parts that dek writes as strings: a stored ZIP, since PNG is already compressed and the XML is small, with Bun's CRC-32. The parts are the minimum PowerPoint opens without a repair: content types, the package and presentation relationships, the presentation, one master, one layout, a theme, a notes master and its theme, and per slide the slide and its notes slide, each with its relationships, and the picture.

**What CI checks, since PowerPoint is not there.** In Chromium, for the sample decks: the text the boxes carry is the text the slide shows in its HTML flow, nothing lost and nothing doubled, and every box lies inside the frame. On the package: every part the content types name exists and parses as XML, every relationship resolves, and the notes carry the script with `--public` taking the directions out. Opening in a real renderer is checked by hand when this area changes; macOS Quick Look renders a slide of a PPTX without PowerPoint, which is how every slide of the three sample decks was checked when this was written.

## Consequences

A talk can be handed to anyone with PowerPoint or Keynote, with its script in the notes and its words editable where they stand, and it looks as it does in the browser, since the browser drew it.

The recipient cannot move a card or recolor a shape: those are pixels. A text edited to be much longer than it was runs past where the original ended, over the picture, since its box does not wrap; and its shadow, if it had one, stays as it was drawn. A deck that sets its text in SVG gets a PPTX with little to edit; the docs say to write text as HTML when it is to be edited.

OpenType features PowerPoint does not apply, such as `palt`, which the sample themes use to tighten Japanese punctuation, set a line a little wider than the browser did; a line followed by a chip on the same line can run under it.

The file is larger than a native one, about a picture per slide at twice the logical size.

`dekc pptx`, its flags, and `outs` are dek's from now on.
