# 102. Paint a PPTX slide's color as PowerPoint's own under background pictures that stay in the slide's picture

Date: 2026-11-18

## Status

Accepted

Amends [23. Make a deck's tokens PowerPoint's theme and a slide's background PowerPoint's own with dekc pptx --shapes](0023-make-a-deck-s-tokens-powerpoint-s-theme-and-a-slide-s-background-powerpoint-s-own-with-dekc-pptx-shapes.md)

## Context

ADR 23 made a slide's background PowerPoint's own "when PowerPoint paints it as the browser did": one opaque color, or one linear gradient along an axis. "Anything else stays in the picture: an image, a radial or repeating gradient, a diagonal, a color hint, a gradient in another color space or with a stop the page shows through, a second layer." And it stays whole: color and pictures together. Its consequences name the case: "A theme whose slide background is an image, a texture, or layered gradients, as the sample decks' `why-dek` is, keeps it in the picture".

`evals/pptx/` counts what that costs. `why-dek` draws two rules on every slide, a ruler across the top and a hairline across the bottom, as two gradients sized and placed in the slide's `background-image`, over its paper color. The rules cover a thousandth of the slide. Because of them the color stayed in the picture too, so every one of its 18 slides carried a slide-sized picture with no pixel left transparent, under 388 shapes that are PowerPoint's own: 100% of the slide covered, where `with-agents`' pictures cover 64%. A recipient who wants the deck on another paper has 18 pictures to redraw, and Format Background changes nothing they can see.

A background's layers are painted in order, the color first and each picture over it. Unless a picture is blended into what is under it, the color under the pictures and the pictures over nothing add up to the same slide.

## Decision

**Where a slide's background has pictures PowerPoint's own would not draw alike, its color is PowerPoint's all the same, and the pictures stay in the slide's picture, over nothing.** The slide's own box qualifies as ADR 23 has it, painting nothing but its background over the whole viewport, with no border, round corner, shadow, outline, filter, opacity, or transform; what it need not be here is one picture that fills the box, so a background's size and position are free. Each layer must be drawn over the color and not into it, `background-blend-mode: normal`, and out to the box's edge, `background-clip` the border or padding box, and the color must be opaque. The color is then written as the slide's background, the theme's own when it is the theme's background color, as any color is. The slide is shot with only its `background-color` made transparent: what the background's pictures draw is in the shot, on nothing.

**A background PowerPoint draws alike is still its own whole.** One linear gradient along an axis that fills the box is the slide's background as before, and nothing of it is in the picture.

**What CI checks.** On the plan, with computed values made up: a color under pictures is the slide's background, with word that the pictures stay; not a color the page shows through, nor one in a box that paints more than its background; a gradient PowerPoint draws alike is taken whole as before. In Chromium: a slide whose background is a color and a rule drawn by a gradient sized and placed has the color for its background, and a picture in which the rule is opaque and the rest transparent.

## Consequences

`why-dek`'s slide-sized pictures cover 4.4% of the slide where they covered all of it, and the sample decks' 44.1% where they covered 85.1%. Its paper is the theme's background: Format Background, or another color scheme, changes all 18 slides. The rules are still a picture, slide-sized and transparent but for them, on each slide.

The file is larger by a tenth, 0.95 MB from 0.87: a picture with an alpha channel and a few rules packs less well than one flat color did. Six of the 18 pictures are the two rules and nothing else, the same byte for byte; storing one of them would undo that and more, and is a decision of its own.

A picture drawn over the color with `background-blend-mode`, or a color the page shows through, keeps the whole background in the picture as before.
