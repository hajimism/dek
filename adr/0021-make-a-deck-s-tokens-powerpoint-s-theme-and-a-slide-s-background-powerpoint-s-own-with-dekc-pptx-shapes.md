# 21. Make a deck's tokens PowerPoint's theme and a slide's background PowerPoint's own with dekc pptx --shapes

Date: 2026-10-27

## Status

Accepted

Amends [20. Lay boxes, pictures, and the text in them over a PPTX's picture as PowerPoint's own with dekc pptx --shapes](0020-lay-boxes-pictures-and-the-text-in-them-over-a-pptx-s-picture-as-powerpoint-s-own-with-dekc-pptx-shapes.md)

Amended by [22. Make every dekc pptx lay out what PowerPoint draws as its own, and drop --shapes](0022-make-every-dekc-pptx-lay-out-what-powerpoint-draws-as-its-own-and-drop-shapes.md)

## Context

ADR 20 lays a slide's boxes, pictures, and text over its picture as PowerPoint's own. What it leaves is the picture under them, and the picture holds the slide's background, so a recipient who wants another background, or the deck in other colors, has a slide-sized image to replace, and every shape's color to change one by one. The file's theme is PowerPoint's default, which names Calibri and Office's blues, none of which the deck uses.

A dek theme is already a theme. Its colors and fonts are tokens on `.slide`: `--fg`, `--bg`, `--muted`, `--accent`, `--font-title`, `--font-body`. A slide's stylesheet may write a raw color only when it sets a token (`DEK014`), so every color a slide paints comes from a token. PowerPoint's theme has slots for the same things, a color scheme of twelve and a font scheme of two, and a shape or a run that refers to a slot changes with it.

## Decision

**With `--shapes`, the deck's tokens are the file's theme, and a slide's background is PowerPoint's own when PowerPoint paints it as the browser did.** Without the flag, nothing changes: the file is ADR 8's, its theme PowerPoint's default.

**The theme's slots.** `--fg` is Dark 1, `--bg` Light 1, `--muted` Dark 2, and `--accent` Accent 1; the master maps text 1, background 1, and text 2 to them as PowerPoint's own master does. The other eight slots are PowerPoint's own. Each token is read as an element set in it computes it, so a token set from another, or written in any color space, comes to an sRGB color; one the page shows through, and one the slide does not set, fills no slot. `--font-title` is the theme's heading font and `--font-body` its body font, each as the faces Chromium drew Latin and East Asian text in with it. A slide's stylesheet may set a token of its own, so the deck's theme is each token as most slides have it, the first slide's on a tie.

**What refers to the theme.** A color a shape, an outline, a line, a background, or a run paints that is exactly a slot's, to the 8-bit channel, is written as that slot, its alpha with it, so it follows when the slot is changed; two tokens of one color are taken in the order text, background, accent, muted. Any other color, a mix of tokens or a token a slide set for itself, is written as itself. A run set in the `font-family` a font token is, the body's on a tie, is set in the theme's font, each script in its own face, as the browser set it; any other names the face it was drawn with, as ADR 8 has it. An SVG part keeps its own colors.

**A slide's background.** The slide's own box, when all it paints is its background over the whole viewport, with no border, round corner, shadow, outline, filter, opacity, transform, or background size, position, or blend mode of its own, is painted by PowerPoint when its background is one opaque color, or one linear gradient along an axis whose stops are opaque sRGB colors placed in percents or pixels, as CSS places them. Anything else stays in the picture: an image, a radial or repeating gradient, a diagonal, a color hint, a gradient in another color space or with a stop the page shows through, a second layer. A background that is the theme's background color is the master's, which every slide shows; any other is the slide's own. When something a negative `z-index` puts in a slide that is no stacking context lies under the slide's background, out of sight, the background stays in the picture, which hides it as the browser did.

**The picture under it.** A slide whose background is PowerPoint's is shot on nothing, a PNG with an alpha channel. A slide with nothing left in that shot, every pixel transparent, has no picture at all. Whether anything is left is read from the shot itself, not from the plan, since paint dek does not measure exists.

**What CI checks.** On the package: the theme's slots and fonts in their order, a color the theme has written as its slot with its alpha, a run in a font token set in the theme's fonts, a background the master's or the slide's own, a gradient's stops and angle, and a slide without a picture whose relationships still resolve. On the parsing: each background CSS can write that PowerPoint paints alike, and each that stays in the picture; the deck's theme as most slides have it. On the plan: a background kept under what a negative `z-index` hides beneath it. In Chromium: a deck of two slides, one whose theme's slots, shape colors, and fonts refer to the theme and which leaves no picture, and one whose gradient is PowerPoint's over a picture on nothing. That the sample decks' slides, slide master, and theme with `--shapes` validate against the ECMA-376 schemas was checked by hand when this was written, and that a file opens in PowerPoint is checked by hand, as ADR 8 has it.

## Consequences

A recipient restyles the deck as PowerPoint's own are restyled: a new color scheme or font scheme in the Design tab recolors and resets what the slides painted in the tokens, and a slide's background is changed in Format Background, not by replacing a picture. A slide drawn only in boxes and text carries no picture at all.

The match is by value, so a color a slide paints that equals a token without coming from one follows the theme too; with `DEK014`, such a color is a token's under another name. A color mixed from tokens, a token's tint, and what a slide sets for itself stay fixed. Only four of the theme's twelve color slots are the deck's; a theme's further tokens have no slot, and are written as their colors.

A theme whose slide background is an image, a texture, or layered gradients, as the sample decks' `why-dek` is, keeps it in the picture; its colors and fonts are still the theme's. The angle of a diagonal gradient depends on the box's proportions in CSS and not in DrawingML, so a diagonal stays in the picture rather than turn a little.

The text the theme's fonts set is each script in its own face, as the browser drew it, where ADR 8 names one face for a whole run; a run of Latin in a Japanese face can come out a little wider or narrower than before, closer to the browser.

The file's look is the theme's until someone changes it, which a picture never let them do. `--json` keeps its shape.
