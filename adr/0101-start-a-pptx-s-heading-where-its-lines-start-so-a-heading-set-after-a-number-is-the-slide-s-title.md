# 101. Start a PPTX's heading where its lines start, so a heading set after a number is the slide's title

Date: 2026-11-18

## Status

Accepted

Amends [99. Set a PPTX's text a block a text box, broken where the browser broke it, its heading the slide's title](0099-set-a-pptx-s-text-a-block-a-text-box-broken-where-the-browser-broke-it-its-heading-the-slide-s-title.md)

## Context

ADR 99 made a slide's heading its title: "Of the headings that became text boxes of their own, the highest, `<h1>` before `<h2>`, and the first of those". A heading is a text box of its own when it is set in plain lines, and one of the things that makes lines plain is that each starts at the block's margin: "lines the browser started elsewhere, around a float or after something set before them, would move".

That left ten of the sample decks' 42 slides without a title, and ADR 99 said which: "the ten without are `lightning`'s, whose headings begin with a pseudo-element's number, which starts their line off its margin." The theme sets `#02` before each heading's words with `::before`, the heading a flex container, so the number and the words are two boxes side by side. The words start 69 pixels in from the heading's edge, on every line they have, and for that the exporter left them a line box, which PowerPoint lists as no title. Its outline shows ten slides without a name, and its accessibility checker reports each.

The words in such a heading are in a box of their own all the same: the one the flex container makes for them, which starts where they start. A paragraph set from there starts every line where the browser did. What a float moves is another matter: only the lines beside it start late, and the ones under it start at the edge.

## Decision

**A heading whose lines all start at one place past its edge starts there.** Where every line of a heading that is set from the left starts at the same place, more than two pixels right of its content box's edge, the plan takes that place for the edge: the heading's words are a text box from there to the heading's far edge, with no indent, and wrap what is typed into them at that width. What stands before them, a number or a mark a pseudo-element drew, is laid out as it was: text in a line box of its own, or a shape, or part of the picture.

**Only a heading, and only out of a shape.** Other text that starts off its edge stays in lines, as ADR 99 has it: a terminal's line after its prompt, a line of code after its indent. Such text is set a line a block, and a box that wraps would not be what its `white-space` says. A heading in a card is no title, since PowerPoint keeps a title out of a group, so nothing changes for it.

**One line its style centers, or sets to the right, that stands elsewhere is set from where it starts.** A heading centered with a mark before it has the two centered together, so its words stand right of where a centered paragraph would put them; ADR 99 has a block be a paragraph only where each line is where its alignment puts it, within two pixels. Such a heading of one line is a text box from where its words start, set from the left. A recipient who types more into it sees it grow to the right, not from its middle.

**Lines that start in two places stay lines.** A heading beside a float, or one whose first line alone is indented or follows an inline mark, has lines at two places, and no one margin sets them both. So does a centered heading of two lines that stand off their middle.

**What CI checks.** On the plan, with measurements made up: a heading of one line and of two that start 70 pixels in is one text box from where they start to its far edge, the slide's title, its paragraph with no margin and no indent; one whose lines start in two places stays in lines; text that is no heading stays in lines; a centered heading where centering puts it is not touched, one of one line that stands at the far edge is the title, set from the left, and one of two such lines stays in lines.

## Consequences

Every slide of the sample decks with a heading has a title: 42 of 42, from 32. The ten headings are text that wraps where it did not, 54 characters, so the share of text in a box that wraps rises from 40.2% to 40.6% and `lightning`'s from 45.6% to 47.3%.

The number before the heading is not in the title. PowerPoint's outline reads "約束をひとつ", not "#02 約束をひとつ", which is how the slide's own `##` in `script.md` reads.

A recipient who types a longer heading sees it wrap under its first word and not under the number, as the browser would wrap it.

Text other than headings that something starts off its edge is still in lines. Giving every such block its lines' margin would make 694 more characters of the sample decks text that wraps, most of them terminal lines and code, and was not done for the reason above.
