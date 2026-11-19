# 106. Say where text lies and what PowerPoint will wrap when a PPTX is built again, and keep a shared backdrop on the master

Date: 2026-11-19

## Status

Accepted

Amends [104. Build a PPTX again from JSON an agent writes, with dekc pptx spec and dekc pptx --from](0104-build-a-pptx-again-from-json-an-agent-writes-with-dekc-pptx-spec-and-dekc-pptx-from.md)

Amended by [108. Build a table again as PowerPoint's own table, its cells' text editable and wrapped in them](0108-build-a-table-again-as-powerpoint-s-own-table-its-cells-text-editable-and-wrapped-in-them.md)

## Context

ADR 104's trials rebuilt one deck, `with-agents`, and its table had nothing to set them against: the rebuild as people do it now, with no spec and no check, was not run. A fourth round ran it, and the skill's flow on the two other sample decks, each a fresh agent:

- **Today's flow**, on `with-agents`: an agent given the deck and asked for an editable PowerPoint, with pptxgenjs and none of dek's spec, `--from`, checks, or skill.
- **The skill's flow**, on `lightning` and `why-dek`: an agent given `dek-pptx` and the deck.

Each reached a file. What the three agents reported missing, and what opening the files in PowerPoint showed, is what this decision answers:

- The outline said where a block's box was, not where its text lay in it. A terminal's line number ran into its code (`1<section`), words either side of a swatch into one `content`, and nothing said where a block's own first line started beside the blocks inside it.
- A heading the browser broke between phrases was broken mid-word in PowerPoint, which sets it wider and breaks it where the box runs out (`一枚のスライドは、小さ` / `なファイル`). The outline said how many lines there were, not where they broke.
- What a pseudo-element painted without writing text, a dot, an arrow, a tick, made its host a picture cropped to the host's box, losing what reached past it. An empty element inside a line's words, a strike bar, was in no node. A terminal's blank line was in none either.
- The color `::after` wrote in was its host's in the runs, a gradient marker behind words reached no run's `background`, a shadow was a CSS string, `sides` said nothing of dashes, and a see-through color was `#rrggbbaa` in `spec.json` that the JSON refused.
- A color whose last component is 0, black among them, read as see-through in the walk, so the outline dropped such fills and borders.
- A window's title bar as `round2SameRect` set its text lower than the browser, by about 0.29 of its radius, and ignored its radius.
- The three agents spent most of their effort, as ADR 104's had, fitting boxes to text PowerPoint sets wider, and no check said where a box was too narrow.
- Every rebuilt deck's backdrop was the same picture on every slide, each slide holding its own reference to it.
- Today's flow's file had, on each of its 13 slides, a second title box (`<p:ph type="title"/>`) with nothing in it, which PowerPoint shows as "Click to add title" over the slide's real title. `pptx-title` would not have caught it in a file `--from` wrote, and the PPTX eval counted that file as titled.

## Decision

**`spec.json` says where each stretch of text lies.** A text's `pieces` are its own characters as the browser placed them, read character by character from Chromium's layout: each stretch of a line set without a gap, with its box. A line ends where the next character is on another height, and a stretch where the gap before the next character is wider than 0.4 of its size. `lines` counts lines that share a height, so one line of two sizes is one. What `::before` and `::after` write is not in `pieces`; their nodes have boxes of their own.

**More of what a slide paints is a node.**

- A pseudo-element that paints, writing text or not, is a node of its own, `::before` or `::after`, with its border box as Chromium laid it out, which may reach past its host's, its fill, border, radius, rotation, and text. What a shape cannot draw of it is a part of its own, named `<slide>-<node>-before.png`, drawn without its host's paint. Its host is no longer a picture for it. The slide's own pseudo-elements stay its background's, in its part, which is its backdrop.
- An inline box set to a width of its own, `inline-block`, `inline-flex`, or `inline-grid`, is an `inline` node, as a chip is, its text its line's.
- What paints inside a line's words without saying anything, such as an empty element drawn as a strike, is a node.
- Preformatted text that is only spaces, a terminal's blank line, is a text whose `content` is a space.

**What the outline says is in the JSON's terms.** Text `::after` writes is a run in its own color; a gradient behind words is the run's `background`, its first color that shows; `shadow` is each of a node's shadows, `{ x, y, blur, spread, color, inset? }`; each of `sides` has its `style` when dashed or dotted. The walk reads a color's alpha as its fourth component only. A color in the JSON may be `#rrggbbaa`, its alpha multiplying an `alpha` beside it, so the colors `spec.json` writes go in as they are.

**`--from` checks more.**

| id | severity | finds |
| --- | --- | --- |
| `pptx-title` | error | as before, and two layers marked `title`, or a title layer with no text in it |
| `pptx-fit` | warning | a text the browser set on one line whose box, wrapping, is narrower than its pieces' width times its `widen`, by more than 2 px or 0.5% |

A text's box for `pptx-fit` is the smallest layer over it that holds its characters, less its insets. A layer that does not wrap is not looked at.

**The writer.** A `round2SameRect` is rounded by the shape's `radius`, and by PowerPoint's default of a sixth of its shorter side without one, and its insets give back what its own text area takes inside its top, left, and right, as they do for a rounded rectangle. When every slide of a deck has a `backdrop` and it is the same picture on each, it is the slide master's background and no slide's own. `dekc pptx` writes neither, and its files are byte for byte as they were.

**The PPTX eval** finds a box a layout fills (`<p:ph>`) with no text in it, which PowerPoint shows as its prompt, and a slide with more than one title box, as problems, takes a ZIP's folder entries for what they are rather than parts without a content type, and counts the master's background picture as the backdrop of each slide that sets none.

**The skill** says where `pieces` lie and what they leave out, sizes a box to its text by its pieces, keeps a heading of more than one line broken where the browser broke it, with a `\n` and a box as wide as its widest line times `widen`, and asks for one title with its text in it.

## Consequences

The PPTX eval read the fourth round's files beside ADR 104's:

| | `with-agents`, today's flow | `with-agents`, trial 3 | `lightning` | `why-dek` |
| --- | ---: | ---: | ---: | ---: |
| tool calls | 142 | 111 | 69 | 118 |
| tokens | 339k | 366k | 335k | 349k |
| minutes | 46 | | 20 | 37 |
| editability (`dekc pptx`'s) | 0.621 (0.614) | 0.678 (0.614) | 0.884 (0.789) | 0.838 (0.767) |
| text whole in one block | 40.0% | 46.4% | 81.3% | 73.0% |
| slides keeping a picture of the slide | 0 | 0 | 0 | 0 |
| cards and windows grouped | no | yes | yes | yes |
| problems in the package | 38 | 0 | 0 | 0 |

The tools do not make the rebuild cheaper: an agent spent about 340k tokens on a deck with them or without. What they change is what comes out. Today's flow's file groups nothing, splits code and tables into a box a word, names in `[Content_Types].xml` twelve masters it does not hold, and has a second, empty title on every slide. Its drawing beside the browser's, 37 of 255 apart, is not set against the others: it names Yu Gothic and Consolas, which this Mac does not have, and Quick Look drew it in others. What it did better is kept for later: it put its background, footer, and slide number on a master, which the shared backdrop now begins, and named the faces the recipient's PowerPoint has. One run a flow on one deck is no measure of effort, and the skill was rewritten between rounds.

`lightning` and `why-dek` were opened in PowerPoint for Mac, where each slide's title is one title box with its text; today's flow's file was opened too, and showed its empty titles' prompt over the real ones. The three skill-built files reach no `pptx-fit` with the agents' widths: their agents had fitted every box by looking. The same file with its titles narrowed to the browser's widths raises it on all 11 of them.

`spec.json` is a contract of its own, as the JSON is: trial 3's script, which read `shadow` as a CSS string, fails on the new shape, and a script that names parts by their file finds them renumbered once more nodes are walked. A rebuild's script is run again after `dekc pptx spec`, which is what the skill asks for; a change to `spec.json`'s fields is a breaking change to every such script once the feature is released.

`pieces` make `spec.json` larger: 1.3 MB for `why-dek`'s 18 slides and 0.5 MB for `lightning`'s 11. An agent reads it a slide at a time. One `spec` run of `why-dek` did not finish within the worker's 600 s while the eval ran beside it, and every run after took 8 s; it was not found again.

Still out of the JSON: text with a glow or drawn as an outline, which `lightning` lost to a faint fill, and tables and charts. Today's flow's master and its faces for the recipient's machine are decisions of their own.

What CI checks, besides ADR 104's: in Chromium, a terminal's gutter number and code are pieces apart with the gutter an `inline` node, its blank line a space, its prompt's `::after` a run in its own color, a strike drawn by an empty element a node, one line of two sizes one line, a pseudo-element's dot past its host a node with its box and fill and its host no picture, a gradient marker a run's background, a dashed side's style, a shadow's parts, and words either side of a swatch pieces apart; without a browser, `#rrggbbaa` read as a color and an alpha, a second and an empty title, `pptx-fit` on a box 10 px too narrow and not on one wide enough or one that does not wrap, a `round2SameRect`'s rounding and insets, a shared backdrop on the master and a backdrop that differs on its slide, and the eval's empty title boxes, two titles, folder entries, and master backdrops.
