# 14. Print the PDF as a picture of each slide with its text laid over it unseen

Date: 2026-10-19

## Status

Accepted

## Context

`dekc pdf` printed the print document with Chromium's own `page.pdf()`: every slide as vectors, its text as fonts, as Chromium's PDF backend, Skia, writes them. Two common pieces of CSS come out of Skia as soft masks:

- a `box-shadow` with a blur, as the shadow's color filled over the whole extent of the blur, through a luminosity mask that is a grayscale picture of the blur;
- `background-clip: text`, the usual gradient type, as the background drawn twice, once through an alpha mask of the whole box with an inverting transfer function and once through an alpha mask of the glyphs.

Apple's PDF renderer, the one in Preview, Quick Look, Safari, and iOS and iPadOS, draws both wrong: the shadow as a flat translucent box over the whole extent of its blur, and the clipped gradient as glyphs up to a point and a solid block of the gradient past it. pdfium, the renderer in Chrome and Edge, draws them as the browser does. The deck that brought this up, with cards under a blurred `--shadow` and a gradient `.accent` in its titles, came out of Preview with boxes over its cards and over half of its cover's title. The sample themes `lightning` and `with-agents` blur shadows too.

It is not one Chromium's regression: the same CSS printed by Chromium 153 and 156 breaks the same way on macOS 26. It is not the fonts: Chromium writes Hiragino as Type 3 fonts, since its license forbids embedding, but a gradient set in an embedded Helvetica Neue breaks the same way. Rewriting the PDF did not make Preview draw it right: neither the grayscale mask stored as Flate instead of JPEG, nor the masks' bounding boxes made larger, nor their groups made non-isolated. dek cannot make Apple fix its renderer, and a PDF is the file a talk is handed over in: to an organizer, to people in the room, to anyone on an iPhone.

A picture draws the same in every viewer. `dekc pptx` already draws each slide as a picture at twice its size and lays its text over it ([ADR 8](0008-export-a-talk-as-pptx-with-editable-text-over-a-picture-of-each-slide.md)). `filter: drop-shadow()`, which Skia rasterizes itself, is the one shadow Preview draws right, which says the same.

## Decision

**Each page of `dekc pdf` is a picture of its slide, with the slide's text laid over it, unseen.** The worker loads the print document as before, with every slide at its last beat, waits for its fonts, and draws it for print (`emulateMedia({ media: "print" })`) at twice the slide's size, the scale the PPTX uses. It shoots each `#deck > .slide` as a PNG, takes every slide's paint away but its text, sets each shot as its slide's background, one slide a message to the page so that a long deck never sends more than one picture at once, and prints the page.

**The text is still text, where it was laid out.** A stylesheet in a cascade layer, so that its `!important` declarations win over any a theme or a slide writes, whatever their selectors weigh, takes away only paint, never layout: each slide's and descendant's color, text fill, stroke, decoration, emphasis, and shadow; its background, border color and border image, outline color, column rule color, and box shadow; transitions, so none runs from the visible to the taken-away. Images, video, canvases, frames, embeds, form controls, and SVG images draw at opacity 0, and SVG shapes and text fill and stroke with nothing. Chromium writes transparent text as text at zero alpha, so a reader selects, searches, and copies it where they see it, and links stay where they were.

**Filters and backdrop filters go, but not the boxes they made.** A backdrop filter left in place would blur the picture under it again, and a filter makes Skia draw its element, text and all, as pixels. Each element with either has it set to `none` inline and the same property named in `will-change`, which keeps the element the containing block of its positioned descendants, so they stay where they were laid out. A slide's own opacity and blend mode go too, since its picture already holds them.

**Only `dekc pdf` changes.** The browser's own Print, which the player wraps in `@media print`, still prints vectors; the docs say so, and say `dekc pdf` is the file that looks the same in Preview. The print document, `--json` (`outs`), the flags, and the stop on a slide script that cannot run are as they were.

**What CI checks.** In Chromium: a PDF of slides with a blurred shadow, a gradient clipped to its text, and a filter has exactly one picture per page, at twice the slide's size, no luminosity or alpha soft mask, and its text drawn as text at zero alpha; and laying the text over a picture leaves a positioned element inside a backdrop-filtered one where it was, beats a theme's `!important` color under an ID, and takes the slide's border and an image's paint away. Preview itself is not in CI; every page of the deck that brought this up was checked in macOS PDFKit when this was written, and its text boxes against the picture in pdfium.

## Consequences

A PDF from dek looks as the browser drew it in every viewer, Apple's included, whatever CSS the deck uses; Chromium's PDF backend is no longer what decides how a deck looks once printed.

The pages are pixels, 2560 × 1440 for a 16:9 slide: zoomed in until the screen shows more pixels than that, the type softens, and a print shop gets a picture, not vectors. A reader who copies text gets it as before; the fonts the PDF carries now draw only the text no one sees.

The file is mostly larger, about a PNG per slide at twice its size: the deck that brought this up went from 1.7 MB to 4.3 MB for seven slides, `lightning` from 2.2 MB to 7.6 MB for eleven, and `why-dek` from 1.9 MB to 6.2 MB for eighteen. A deck heavy with effects can come out smaller, since Skia's soft masks are pictures too: `with-agents` went from 9.0 MB to 6.1 MB for thirteen.

A paint property the stylesheet does not take away, such as a list marker drawn from an image or an image a pseudo-element's `content` draws, is drawn again over its own picture, in the same place; one drawn in a soft mask Apple draws wrong would show again there. The list above is what a theme paints with; one that adds to it changes this stylesheet, in `src/core/pdf-text.ts`.

A deck's PDF and its browser's Print differ in how they are drawn, though not in what they show.
