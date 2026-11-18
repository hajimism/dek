# 103. Store a PPTX's picture once, however many slides show it

Date: 2026-11-18

## Status

Accepted

Amends [8. Export a talk as PPTX with editable text over a picture of each slide](0008-export-a-talk-as-pptx-with-editable-text-over-a-picture-of-each-slide.md)

## Context

A PPTX is a ZIP of parts, and a slide shows a picture by a relationship to the part that holds it. `dekc pptx` wrote a part for every picture a slide shows: the slide-sized picture of what PowerPoint cannot draw as its own (ADR 8), and each image, canvas, and SVG laid over it (ADR 22). Nothing says a part belongs to one slide. PowerPoint itself stores a picture once that is pasted on many slides, and points each at it.

What stays in a slide's picture is often the same on every slide. A theme draws a rule, a band, a mark, or a texture with something PowerPoint has no shape for, a gradient or a pseudo-element, and it is drawn on each slide alike. With ADR 102 the color under it is no longer in the picture, so on a slide where everything else is PowerPoint's own, the picture holds that and nothing more: six of `why-dek`'s 18 are the same two rules, byte for byte. In one deck of 42 slides outside this repository, 19 slides each carry the same picture, a band across the top. A logo set on every slide with `<img>` is written once a slide in the same way.

## Decision

**A picture is in the file once.** When the package is written, each picture is looked up by its bytes among those already stored with the same extension; one that is there already is not written again, and the slide's relationship points at the part that holds it. A relationship is still written for every picture a slide shows, numbered as before, so a slide's XML does not change: only where its relationships point. Parts keep the names they had, the first of each picture its own, so a file with no two pictures alike is the file it was, byte for byte.

**By its bytes, not by what it shows.** Two pictures that look alike and differ in a byte are two parts. Chromium shoots the same pixels into the same PNG, which is what makes the copies copies; nothing is decoded to compare.

**What CI checks.** On the package: three slides that show two pictures between them, one of them twice on a slide and as another's slide-sized picture, have two parts, each slide's relationships numbered one by one and pointing at them; a PNG and an SVG of the same bytes are two parts.

## Consequences

A file shrinks by what it repeated: `why-dek`'s to 0.86 MB from 0.95, less than the 0.87 it was before ADR 102 took its color out of its pictures. The deck with the band on 19 slides is 1.36 MB from 1.85. A deck whose theme leaves the same band or texture on every slide carries it once.

A recipient who replaces one slide's picture through PowerPoint replaces it on that slide: PowerPoint writes a new part for it, as it does for its own shared pictures.

Decks whose slides' pictures all differ, as most slides' do that have anything of their own left in the picture, are as large as before. Cutting a slide's picture down to what it shows, so that what repeats can be told from what does not, is a decision of its own.
