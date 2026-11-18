# 100. Name the face that drew a PPTX's text where its family has several on that side of bold

Date: 2026-11-18

## Status

Accepted

Amends [98. Space a PPTX's characters as the browser's features did, name a face a script, and deflate the file](0098-space-a-pptx-s-characters-as-the-browser-s-features-did-name-a-face-a-script-and-deflate-the-file.md)

Amends [23. Make a deck's tokens PowerPoint's theme and a slide's background PowerPoint's own with dekc pptx --shapes](0023-make-a-deck-s-tokens-powerpoint-s-theme-and-a-slide-s-background-powerpoint-s-own-with-dekc-pptx-shapes.md)

## Context

A run of a PPTX says its font with a name and two switches, bold (`b`) and italic (`i`). ADR 8 names "the font Chromium actually drew it with", ADR 98 a face for Latin and a face for East Asian text, and both mean the family: "Hiragino Sans". CSS has nine weights, and a family may have a face for each. Which of them a family's name and `b` stand for is the renderer's choice.

ADR 98 knew of one case and left it open: "A weight between regular and bold, or past bold, is still PowerPoint's regular or bold: Chromium draws Hiragino Sans at `font-weight: 600` in W6, and Quick Look draws the same family's bold in W7, a little wider. 30 of the 46 lines left are Latin labels in `with-agents` … Naming the face itself, as PowerPoint for Mac does, is a decision of its own." It also had no PowerPoint to ask: "nothing on the machine this was written on can show what it does".

PowerPoint 16.115.1 for Mac is on the machine now, and it can be asked without looking at it. Its scripting dictionary gives every line of every text as PowerPoint laid it out: where it starts, and where its last character ends (`left bounds` and `bounds width` of a `line` and a `character` of a `text range`). A file opened through Launch Services, behind the other windows, is read in a few seconds a slide, and each line is compared with where the browser set it. What follows was measured that way, and in Quick Look as `evals/pptx/` does, on `evals/pptx/hand-check/` and on the three sample decks.

**The three renderers disagree about one family.** Chromium draws Hiragino Sans at 300 in W3, at 400 in W4, at 500 in W5, and so on to W9 at 900. Given the family's name:

| | regular (`b="0"`) | bold (`b="1"`) |
| --- | --- | --- |
| Chromium, `font-weight` 400 and 700 | W4 | W7 |
| Quick Look (macOS 26.7.1) | W4 | W7 |
| PowerPoint 16.115.1 for Mac | W3 | W6 |

So a file was right in one renderer where it was wrong in the other. "Weight 700 太字 Promise", 493 pixels long in the browser, ended 14.6 pixels short in PowerPoint and where it should in Quick Look; "Weight 600 太字 Promise" ended where it should in PowerPoint and 15.5 pixels long in Quick Look, which is the 30 lines of ADR 98. And what no measure had shown: all of a deck's regular text is a weight lighter in PowerPoint than in the browser. Kana and ideographs are as wide in W3 as in W4, so most lines still ended in place; a line with Latin in it, which is narrower in W3, ended short, 4.5 pixels in a line of 448 with one word of Latin. The eval could not see it, since Quick Look agrees with Chromium there, and the hand check had no line of regular Latin in Hiragino Sans.

**A face can be named, and both renderers draw it.** 21 copies of one slide were written, each naming the two lines' face another way:

- The face's full name ("Hiragino Sans W7"), its name in the font file ("HiraginoSans-W7"), and its full name in Japanese are each drawn in that face by both, with `b` on or off.
- `b="1"` adds nothing to a face that is bold already, W6, W7, and W8. On a face that is not, W3 or W4, PowerPoint thickens it itself: 463 pixels where W3 is 449 and W6 is 478.
- A name no font has falls back to another font, in bold where the run says `b="1"`.
- PowerPoint shows the name as it is written. "Hiragino Sans W7" is what its font menu lists; "HiraginoSans-W7" is drawn the same and is in no menu.
- A theme's font that names a face is drawn in it by the runs that follow the theme. Their bold is then thickened as above: with the theme's body font "Hiragino Sans W4", the headings that follow it with `b="1"` ran 8 to 14 pixels long.

**The kerning question of ADR 98 is answered for this PowerPoint.** "AVATAR To We Type 1,234.56", set in Helvetica Neue with no `kern`, ends 0.1 pixel from where the browser ended it: PowerPoint 16.115.1 for Mac kerns a run that names no size to kern from.

## Decision

**A run names the face that drew it where its family has several on its side of bold.** A run says no more of its weight than which side of bold it is on, at 600 and up as before. So for each way text is set, the page is asked what drew the same characters at each other weight on that side: 100 to 500, or 600 to 900. Where the family drew them all in one face, as Menlo has one bold and Helvetica Neue one for everything from 600 up, its name and `b` can mean no other, and the run is written as before. Where it drew several, the run names its own: "Hiragino Sans W4" at 400, "Hiragino Sans W6" at 600, "Helvetica Neue Medium" at 500. `b` stays as it was, so a machine without the face still shows bold; on a face that is bold it changes nothing, and no face under 600 is written with it.

**The name is one the page has seen find the face.** Chromium gives a face's family and its name in the font file, not the full name a font menu shows. The page tries, in this order, the family's name, which is the full name of a family's regular face; the family's name with the style from the file's name after it, as written and with its words apart ("Avenir Next Demi Bold"); and the file's name. Each is set through `@font-face { src: local(…) }`, which finds a face by its full name or its file's name, as a renderer given the name does, and the first that the page then draws in the very face is written. Where none is, the family is, as before.

**Not every text is asked.** Text set aslant, which a run says with `i`, and text an axis of variation shapes are written as before: no name alone finds what drew them. So is a font the page brought with it, which a recipient does not have under any name.

**The theme's fonts are faces too, and a run follows one where it is drawn in it.** ADR 23 has text set in a font token follow the theme, so that a recipient restyles a deck by changing two fonts. A token is a family and a theme's font is one face a script, so the theme now names, for each token, the face most of the characters set in it were drawn in, Latin and East Asian each by their own count; where both tokens are one family, the title's font is the face of the slides' titles, and the body's that of everything else. A run follows the theme when it is set in the token and, for each script it holds, drawn in the face the theme names for it. Text set in a token at another weight names its own face: a bold word in a paragraph, a label at 600. That is the part of ADR 23 this takes back: such text no longer changes with the theme's font.

**What CI checks.** With answers made up for each: the weights asked on each side of bold, and none for italic text or an axis; which probes ask for a name, and the names tried; the family where one face is on that side, the first name that finds the face where there are several, and the family where none does or the page brought the font; the theme's faces from the text set, a script at a time and the titles apart; and which runs follow the theme. In Chromium: text at five weights in a family with a face a weight, where the machine has one, is written under names that each find the face that drew it, and no two weights on one side of bold share a name.

**What was checked by hand, and how.** `evals/pptx/hand-check/` has a line at each of 400, 500, 600, 700, and 800, and one in Helvetica Neue Medium. In PowerPoint 16.115.1 for Mac, by its scripting as above, and in Quick Look, each ends within half a pixel of the browser's. Other versions of PowerPoint, Keynote, and Google Slides were not asked; the README says what to look for.

## Consequences

Over the sample decks' 42 slides, the lines Quick Look ends off fell from 46 to 10 of 1,517, with-agents' from 39 to 4, and the 30 labels of ADR 98 are among those now right; the share of ink that coincides rose from 0.997 to 0.999. Nothing else the eval counts moved. In PowerPoint, on the hand-check slides, the line set at 700 ends 0.1 pixel from the browser's where it ended 14.6 short, and the regular line with a word of Latin 0.3 from it where it ended 4.5 short: regular text is in the face the browser drew, where it was a weight lighter. The record is in `evals/pptx/results/`.

A recipient sees the face in the font box: "Hiragino Sans W6", with Bold on. That is how PowerPoint for Mac names these faces itself. Turning Bold off does not make such text lighter; choosing another face does.

A machine without the face shows a substitute, as before, regular or bold as the run says. Only the name it could not find is another: the family's name was as absent as the face's. A machine with another version of the family, whose faces go by other names, now misses where it matched: Hiragino Sans is only Apple's, but a family that ships with both macOS and Windows under different face names would be found by its family and not by its face.

Text at another weight than its token's main one does not follow the theme. A recipient who changes the theme's body font changes the paragraphs and not the bold words in them. Before, they changed together and neither was the weight the browser drew.

The export asks the page for more: four or five more probes for each way text is set, once a deck, and a few names for each face that needs one. The three sample decks took 9.7 seconds to write, and 9.8 in the record made on the same machine before: no more than one run differs from the next.

A slide's own stroke weight is still not measured. Where a line ends says which face drew Latin, whose width changes with weight; it says nothing of kana set in a lighter or heavier face of the same width. That the named face is the one drawn was read from Latin and taken for the rest.
