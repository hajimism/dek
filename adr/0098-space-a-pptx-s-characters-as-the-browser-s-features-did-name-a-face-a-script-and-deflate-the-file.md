# 98. Space a PPTX's characters as the browser's features did, name a face a script, and deflate the file

Date: 2026-11-18

## Status

Accepted

Amends [8. Export a talk as PPTX with editable text over a picture of each slide](0008-export-a-talk-as-pptx-with-editable-text-over-a-picture-of-each-slide.md)

Amends [23. Make a deck's tokens PowerPoint's theme and a slide's background PowerPoint's own with dekc pptx --shapes](0023-make-a-deck-s-tokens-powerpoint-s-theme-and-a-slide-s-background-powerpoint-s-own-with-dekc-pptx-shapes.md)

Amended by [100. Name the face that drew a PPTX's text where its family has several on that side of bold](0100-name-the-face-that-drew-a-pptx-s-text-where-its-family-has-several-on-that-side-of-bold.md)

## Context

ADR 8 sets each line of text again where the browser set it, in the same font at the same size, and names what that leaves out among its consequences: "OpenType features PowerPoint does not apply, such as `palt`, which the sample themes use to tighten Japanese punctuation, set a line a little wider than the browser did". ADR 22 put text in shapes, where a line a little wider wraps.

How much wider was not known. A file was looked at in PowerPoint or Quick Look when the exporter changed, and nothing measured it between changes. `evals/pptx/` now does: it writes each sample deck's file, has Quick Look draw every slide, and compares each line's ink with the browser's (`evals/pptx/results/README.md`). Over the three sample decks, 42 slides and 1,372 lines of text, before this decision:

- 531 lines, 39%, ended more than a pixel and more than 1% of their width from where the browser ended them; one line in twenty by 36 pixels or more.
- 281 of them were lines of East Asian text alone, 7% too long at the median; 132 held East Asian and other text; 78 held none, most of them Latin set in Hiragino Sans, whose `palt` narrows Latin too.
- 40 were lines Quick Look broke again in a chip drawn to its text's width, which the wider text no longer fit.

Three things the browser does and PowerPoint does not make the difference, and `palt` is only the first:

- **Features.** `palt` sets kana and punctuation at their proportional widths: a full-width bracket or comma at half an em.
- **Trimming.** Chromium halves the full-width punctuation that meets other punctuation, `、（` or `。」`, by default (`text-spacing-trim: normal`), with no `palt` in the theme at all.
- **Kerning.** Chromium kerns by default; PowerPoint kerns a run from the size it or its master names in `kern`, and dek's name none.

The font was wrong too, in one case. ADR 8 names each run by "the font Chromium actually drew it with", which was the face that drew most of its glyphs. A line of code with a Japanese comment in it, drawn in Menlo and Hiragino Sans, named Hiragino Sans for the whole run, and its Latin came out in Hiragino's. ADR 23 already names two faces, Latin and East Asian, for text set in a font token.

The measure itself needed one correction before it could be trusted. Quick Look sets type in whole points: a 10.5 pt run is drawn at 10 pt, and a character spacing under a point is dropped. Read as it is, it says 70% of lines drift. The eval has it draw a copy of each slide magnified 32 times, where a point is a twenty-fourth of a slide's pixel, and the numbers above are from that.

## Decision

**After each character, a run says the spacing that puts the next one where the browser put it.** The page already measured each line; it now keeps where each character of it starts. It also measures what PowerPoint will make of the same characters with no spacing at all: each character alone, in the same font at the same size, with none of the text's own OpenType features, and each line set again that way, kerned as its font says. The spacing after a character is where the browser started the next one, less where PowerPoint's pen has come to, less how far PowerPoint moves on after the character by itself: DrawingML's `spc`, in hundredths of a point. That one number carries everything the browser did between two characters that PowerPoint will not: a feature's narrower width, punctuation trimmed where it meets, the stretched spaces of justified text, `letter-spacing`, and the gap between two inline elements. It is how a designer tightens a line in PowerPoint by hand, a character at a time.

**Kerning between Latin letters is left to the renderer; beside an East Asian character it is written.** How far PowerPoint moves on after a character is the plain line's advance, kerning included, where neither it nor the next is East Asian, and the character's width alone where either is. Both ends were tried first, and the eval showed each wrong in Quick Look, the one renderer on the machine. With all kerning in the spacing, Quick Look, which kerns Latin whatever a run says, kerned it twice: "AV" and "To" drawn into each other. With none of it in the spacing, 47 lines of Japanese ran long: Chromium kerns kana, as Hiragino Sans has pairs for, and Quick Look does not. Split this way, both are right there. A run still says nothing of kerning, as before. Whether a run should name a size to kern from (`kern`), so that PowerPoint kerns Latin as Quick Look does, is not decided here: PowerPoint kerns from the size a run or its master names, and nothing on the machine this was written on can show what it does with a run that names none, or whether its kerning is the browser's. Where it does not kern, a Latin line is as long as it was before this decision, a hundredth or so too long, and no file is worse for it. The hand check asks, and its answer is a decision of its own.

**A character keeps the spacing its style says while that puts the next within a quarter of a pixel, or 1.2% of the type's size if that is more.** Otherwise it takes the spacing of the character before it, if that will do, and only then its own exact one. The pen is tracked as PowerPoint will set it, so what is left out never adds up along a line, and text no feature touches is written as it was before, a run a style.

**A feature that moves a glyph's ink is followed, not only its width.** `palt` and the trimming take the blank half of an opening bracket from its left: the browser draws its ink half an em earlier. PowerPoint's bracket still has that half, so the character before it is spaced half an em tighter, and the bracket's ink lands where the browser drew it; a negative spacing on the bracket itself, the width alone, would draw the next character over it. What a feature takes is taken from the left of an opening bracket, from the right of a closing bracket, a comma, and a full stop, and half from each side of anything else, kana included. A line that begins with such a character begins that much to the left, which a line box does and a paragraph cannot: in a paragraph the line stands as PowerPoint sets it, from the margin.

**A feature's width is each character's own.** What a feature took from a character, apart from what its neighbors did to it, is the character alone with the text's features against the character alone without them, measured the same way.

**Where the places are not known, the run keeps the letter spacing of its style**, as before: text a `text-transform` changed the length of, as ß to SS, and scripts whose letters join or stack, which no spacing between letters sets again.

**Each run names the face that drew its Latin and the face that drew its East Asian characters.** For each way text is set, its family, weight, style, stretch, language, and features, the page is asked which face drew that text's Latin characters and which its East Asian ones, through `CSS.getPlatformFontsForNode` on a probe of each, once a deck. The run's `latin` and `cs` name the first and its `ea` the second, as ADR 23 has a font token's. A character PowerPoint may give to either face by rules of its own, a dash, an arrow, a multiplication sign, is asked for alone; where the two faces differ, or a third drew it, it is written in a run of its own that names only the face that drew it, and does not follow the theme's fonts. A space is such a character too: the browser draws it in the first face that has one, and Quick Look in the face of what it follows, a narrower space after Japanese. So where the faces differ, a space that follows East Asian text, or a character named alone, is in a run that names the Latin face alone; one that follows Latin, or starts a line, stays in the run it is in.

**The file's XML is deflated.** A run a kana is many runs, and XML that was "small" (ADR 8) is no longer: `why-dek`'s file, whose slides are mostly type, grew by a third. `zipFiles` deflates each part that gets smaller by it, with `node:zlib`, which Bun has, and stores pictures, which are compressed already, as before. dek still depends on nothing to write the file.

**What CI checks.** On the typesetting, with measurements made up for each: the spacing that follows a narrower character and a gap, none for a kerned pair of Latin letters, and the kerning beside a kana; the tolerance, and that nothing adds up; the opening bracket's ink; each fallback; the two faces, and the character named alone. In Chromium: text set with features comes out where the browser drew it when it is set again as the file sets it, with no feature of its own, its Latin kerned and its East Asian text not, each run at the spacing written, to a pixel at each line's end, in whatever font the machine has; a run of Latin and Japanese names two faces where two drew it. On the archive: what is deflated reads back the same, and `unzip` accepts it.

**What is still checked by hand.** Whether PowerPoint draws what Quick Look and Chromium's own model of it draw: that it adds a run's spacing after each character and after the last, whether it kerns the Latin of a run that names no size to kern from, and leaves its kana unkerned, and that it gives each script the face named for it. ADR 8 has a change to how text is set opened in a real renderer; this one was opened in Quick Look, which is on the machine, and not yet in PowerPoint, which is not. `evals/pptx/hand-check/` is three slides that show each of the three at a glance, and says what each outcome means.

## Consequences

Over the same 42 slides, lines whose end Quick Look draws off fell from 531 to 46, of 1,517 it now sets as text, the 95th percentile from 36 pixels to 1, and the share of ink that coincides rose from 0.91 to 0.996, with ADR 99's changes in. No chip's text is broken again. Both records are in `evals/pptx/results/`.

A line of Japanese set with `palt` is close to a run a character: runs for each character of text rose from 0.10 to 0.35 over the sample decks. Text typed into such a line takes the spacing of the character beside it, and a paragraph whose size is changed keeps spacings measured for the old size, which were absolute. A recipient who retypes a line gets one run. The eval reports runs for each character beside how much text can be edited, since the second does not see the first.

The spacing is right for the font it was measured in. A recipient without that font sees a substitute spaced for another's widths, where before they saw it unspaced: wrong either way, as ADR 8 has it.

A weight between regular and bold, or past bold, is still PowerPoint's regular or bold: Chromium draws Hiragino Sans at `font-weight: 600` in W6, and Quick Look draws the same family's bold in W7, a little wider. 30 of the 46 lines left are Latin labels in `with-agents`, which sets its labels so; the ones looked at were these. Naming the face itself, as PowerPoint for Mac does, is a decision of its own.

The files are smaller: the three sample decks' from 18.4 MB to 16.8 MB, and `why-dek`'s, which has the fewest pictures, from 1.9 MB to 0.9 MB. The same files make the same bytes on the same Bun, and may not on another, whose zlib may pack them otherwise.
