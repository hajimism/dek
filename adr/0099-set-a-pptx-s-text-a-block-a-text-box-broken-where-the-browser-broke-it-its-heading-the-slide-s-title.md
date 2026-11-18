# 99. Set a PPTX's text a block a text box, broken where the browser broke it, its heading the slide's title

Date: 2026-11-18

## Status

Accepted

Amends [8. Export a talk as PPTX with editable text over a picture of each slide](0008-export-a-talk-as-pptx-with-editable-text-over-a-picture-of-each-slide.md)

Amends [22. Lay boxes, pictures, and the text in them over a PPTX's picture as PowerPoint's own with dekc pptx --shapes](0022-lay-boxes-pictures-and-the-text-in-them-over-a-pptx-s-picture-as-powerpoint-s-own-with-dekc-pptx-shapes.md)

Amends [24. Make every dekc pptx lay out what PowerPoint draws as its own, and drop --shapes](0024-make-every-dekc-pptx-lay-out-what-powerpoint-draws-as-its-own-and-drop-shapes.md)

## Context

ADR 8 made each line of text a text box of its own, "no wrapping, no insets, the browser's line breaks". ADR 22 gave the text in a plain box to the box, as paragraphs that wrap "where PowerPoint wraps", and ADR 24 made that every file's. A recipient fixes a word where it stands; what they cannot do well is what people do most with a handed-over deck: retype a paragraph, or put a translation in its place, and have it wrap.

`evals/pptx/` counts this from the file (ADR 98). Before this decision, over the sample decks' 42 slides:

- 56% of the text a slide shows was in a block the file held as one paragraph; the rest was in lines, a text box each, or in pieces of lines.
- 7% was in a box that wraps what is typed into it.
- 6% was not text at all: what `::before` and `::after` write, a folio and a running head on every slide of two decks, a number in a badge, a prompt before a command. ADR 8 left it in the picture "by design", since the page cannot read a pseudo-element's text: its `content` comes back as written, `counter(folio)` and all, and nothing gives its box.
- No slide had a title. PowerPoint lists a deck by its slides' titles, in its outline and its slide sorter, and its accessibility checker asks for one a slide.

It also found the text in shapes wrong where the file was drawn. The sample themes break Japanese by the phrase (`word-break: auto-phrase`, ADR 39) and balance their headings (`text-wrap: balance`), so a line ends where a phrase does and not where the line is full. PowerPoint fills a line. A card's paragraph the browser set as "…台本が持っている。" and "スライドはそこから生まれる。" came out as "…台本が持っている。スライド" and "はそこから生まれる。": the same words, broken in the middle of one. Three more were plain faults. A code block whose lines end in a text node of a line break alone lost those breaks, and its lines ran together. A card with a label set above its edge started all its text that much lower, since an inset cannot be less than nothing. And a card with round corners set its text lower and further in by three tenths of its corners' radius: PowerPoint's rounded rectangle has a text area of its own, inside its corners' curve, and the insets were written as if it had none.

## Decision

**A paragraph is broken where the browser broke it.** Wherever the browser ended a line, the paragraph carries a line break, before the first character of the next line and after the space the line ended on; a `<br>` is the break it always was. PowerPoint then breaks where the browser did, whatever either one's rules for breaking are. The breaks are PowerPoint's own soft ones, the kind Shift+Enter types: a recipient who deletes words from a line sees them stay until they take the break out, and one who selects the paragraph and types over it has none left.

**A text wraps what is typed into it where every line has room.** PowerPoint breaks a line that does not fit, so a line the browser fit exactly would be broken again by a hair. Text wraps when each of its lines ends at least three quarters of a pixel short of the box's width, counting a pixel and a half the box is given past it: out of the shape's right padding, or added to a text box of its own. Text all on one line wraps only when each line has 3% of its width to spare, and two pixels: a chip drawn to its text's width never breaks it. Text that does not wrap is given the whole padding past its lines' ends, since Quick Look, and what else reads the file as it does, wraps a shape's text whatever the file says. Text that starts above its shape's top is no column of that shape's. A rounded shape's insets are less by what its own text area already takes, its radius less the radius's reach at 45 degrees.

**Text no shape takes is a text box a block.** A block the browser set in plain lines, one piece a line, at one pitch, each line where its alignment puts it and no other element set among its words, is one text box with one paragraph, as wide as the block's content box, so what is typed into it wraps where the block would have. The items of a list that are such blocks are one text box, an item a paragraph, with the list's marker its bullet where PowerPoint has one (ADR 22), so a bullet is added by pressing Enter. A box grows past its lines' ends by the pixel and a half when it wraps and by a quarter of its widest line when it does not, on the side its lines end on and on both for centered text, by its own width and never by a paragraph's margin, which Quick Look skips; and never past the slide's edge. Anything else stays in lines as ADR 8 has them: a line with pieces set apart, as a chip in a sentence sets them, lines at uneven pitch, text set vertically or right to left, and a block with a line that starts with an indent `white-space` keeps. The indent's spaces could be the paragraph's own, and a code block one text box. But Quick Look drops one space from the start of every line, so each indented line would start a space early in it and in whatever reads the file as it does, where a line box stands exactly; and that PowerPoint keeps such a space was not seen on the machine this was written on. So a code block with indented lines is still a box a line. Making it one text box is a decision for when PowerPoint and Keynote have been asked.

**The slide's heading is its title.** Of the headings that became text boxes of their own, the highest, `<h1>` before `<h2>`, and the first of those, is the slide's title as PowerPoint has one, a shape marked `<p:ph type="title"/>`, where it stands and set as it was: it says everything of itself, so the layout's title gives it nothing but its place in PowerPoint's outline. A slide with a title is laid out as "Title Only", a second layout that holds a title and nothing else, as the master now does; any other stays "Blank". A heading in a card is no title, since PowerPoint keeps such a shape out of a group.

**What `::before` and `::after` write is text.** Chromium's layout has what the page lacks, and the DevTools protocol gives a snapshot of it (`DOMSnapshot.captureSnapshot`): each piece of a pseudo-element's text, counters counted, with the box of each line of it. Each line is a text box, set as the pseudo-element's computed style says, its characters placed by setting the same text the same way where the page can measure it (ADR 98), and its fill is taken out of the picture. A pseudo-element that draws nothing but its text no longer keeps a box under it in the picture; one that draws a box or a shadow too still does, with its text laid over it. One a transform turns, or with no fill, stays drawn whole. A slide's number is written as the digits the browser drew, not as PowerPoint's field, which cannot pad a number with a zero or count the slides: "05 / 18" stays "05 / 18" where the slide is moved.

**White space the browser gave room to is text.** A text node of white space alone is measured where it has a width: the space between two elements set side by side, which was missing from the line. A line break `white-space` keeps is part of its block's text though it has no width.

**What CI checks.** On the plan, with measurements made up for each: the breaks carried, each rule of wrapping, the text box of a block and of a list and where each lies, the title chosen, and what stays in lines. On the package: a text box's and a title's XML, the second layout and what relates to it, every part parsing and every relationship resolving. In Chromium: a code block keeps its line breaks, two elements side by side their space, a counter's text is in the file and out of the picture, a heading is the title and a list one box with bullets; and every sample slide's file carries the characters its page measures, pseudo-elements' included, each once, every box on the slide.

## Consequences

Over the same 42 slides: the text in a block the file holds as one paragraph rose from 56% to 68%, the text in a box that wraps from 7% to 40%, and the text that is text from 94% to 98.5%. 32 slides have a title; the ten without are `lightning`'s, whose headings begin with a pseudo-element's number, which starts their line off its margin. 36 more boxes are shapes, those a pseudo-element's text had kept in the picture. Quick Look breaks no paragraph where the browser did not.

A file's text is fewer, larger objects: a paragraph is selected, restyled, and replaced as one, and a list is a list. More lists are, so more bullets are PowerPoint's: each is hung where the browser drew its marker, which is where DrawingML says a first line starts. Quick Look draws a bullet further left, by as much again as it is hung, some 20 pixels; the eval counts no bullets, and whether PowerPoint draws them as the file says is one more thing the hand check asks. A recipient who edits inside a paragraph meets its line breaks, which a file of PowerPoint's own would not have; they are the price of the line ending where the browser ended it, and the docs say so.

A third of the text is still in lines: text beside a chip, text at uneven pitch, a code block with indented lines, and what a pseudo-element writes, which is a line box a line. A heading's title is the text box it was, so a deck's outline reads as its slides do; a slide with no heading has no title, and the accessibility checker says so.

The folio is editable and does not count. A deck whose slides are to be reordered in PowerPoint has to be renumbered there; a field for a number the browser drew plainly is a decision of its own.

A pseudo-element's text is measured through the DevTools protocol, as its box already was (ADR 8's fonts, ADR 22's pseudo-elements): one more thing that Chromium's own protocol decides.
