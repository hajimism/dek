# 24. Make every dekc pptx lay out what PowerPoint draws as its own, and drop --shapes

Date: 2026-10-27

## Status

Accepted

Amends [8. Export a talk as PPTX with editable text over a picture of each slide](0008-export-a-talk-as-pptx-with-editable-text-over-a-picture-of-each-slide.md)

Amends [22. Lay boxes, pictures, and the text in them over a PPTX's picture as PowerPoint's own with dekc pptx --shapes](0022-lay-boxes-pictures-and-the-text-in-them-over-a-pptx-s-picture-as-powerpoint-s-own-with-dekc-pptx-shapes.md)

Amends [23. Make a deck's tokens PowerPoint's theme and a slide's background PowerPoint's own with dekc pptx --shapes](0023-make-a-deck-s-tokens-powerpoint-s-theme-and-a-slide-s-background-powerpoint-s-own-with-dekc-pptx-shapes.md)

## Context

ADR 22 made laying boxes, pictures, and their text out as PowerPoint's own a flag, `--shapes`, so that `dekc pptx` without it stayed ADR 8's: a picture of each slide with its text over it line by line, broken where the browser broke it. The flag was opt-in for that one guarantee, which text a shape wraps does not keep. ADR 23 put the deck's theme and a plain background behind the same flag.

Both were written in one pull request, before either was released, and their files were opened in PowerPoint: the files open without a repair, look as the browser drew them, and follow a change of color scheme. Against that, the guarantee buys little. A recipient without the deck's fonts sees a substitute either way, and ADR 8's lines run past the cards drawn in the picture under them as surely as a shape's lines wrap; a recipient who needs the slides exactly as drawn has `dekc pdf`. A flag that most handovers should pass is a default an agent has to know to change, and two outputs are two things to keep right.

## Decision

**`dekc pptx` always lays out what PowerPoint draws as its own, and has no `--shapes` flag.** Every rule ADR 22 and ADR 23 write down holds for every file: boxes as shapes, pictures of their own, groups, text in shapes as paragraphs, the deck's tokens as the theme, a plain background as PowerPoint's, and what stays in the picture. Text no shape takes stays ADR 8's, a text box a line where the browser set it. Text a shape takes wraps where PowerPoint wraps it; ADR 8's guarantee of the browser's line breaks holds for the line boxes alone.

**What else changes.** The text output says what each file laid over its pictures and names the slides where nothing came out, on every run; `--json` is `outs`, as it was. The flag, never released, goes from the CLI, the docs, and `llms.txt` with no replacement. The worker always measures paint, fonts, and the theme.

**What CI checks.** What ADRs 22 and 23 list, without the comparison of a file built with the flag against one built without it, and without the sample files being what they were before ADR 22, which no longer holds: every sample slide's file carries the characters its page measures, line by line, each once, measured on a page of its own apart from the file, and its text boxes stay inside the frame.

## Consequences

A deck handed over in PowerPoint can be edited as PowerPoint's own without anyone knowing to ask for it, and an agent has one output to check.

`dekc pptx` changes what it writes for decks built before: their plain boxes are shapes, their images pictures, their text in shapes wraps, their theme is the deck's, and slides drawn only in boxes and text have no picture. Nothing reads a `.pptx` dek wrote, so nothing breaks; a release note says so.

The file is larger and slower to write than ADR 8's: a picture per image and icon, a shot of each alone, and the theme read from every slide.

A recipient who needs ADR 8's file, with the browser's line breaks everywhere, cannot get it. If one turns up, a flag to get it back is a decision of its own.
