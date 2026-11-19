# 104. Build a PPTX again from JSON an agent writes, with dekc pptx spec and dekc pptx --from

Date: 2026-11-19

## Status

Accepted

Amends [8. Export a talk as PPTX with editable text over a picture of each slide](0008-export-a-talk-as-pptx-with-editable-text-over-a-picture-of-each-slide.md)

## Context

`dekc pptx` writes a file that looks like the deck: what PowerPoint can draw exactly comes out of the browser's drawing as PowerPoint's own, and the rest stays a picture of the slide beneath it (ADRs 8, 22, 24, 99). On `with-agents` every one of its 13 slides keeps that picture, over 64% of the slide on average, and half its text is set a line a box. That is the right trade for a file that must look as the deck does, and the wrong one for the people dek's PPTX most often reaches: consultants who hand a deck to a client to rework in PowerPoint. They take the finished deck and have an agent build the file again from nothing, with a library such as pptxgenjs, using the deck as a reference.

That rebuild is the work worth making cheaper, not worth replacing: deciding which cards are one group, which picture can go, and what a recipient will want to retype takes judgment a converter does not have. What the agent lacks is what dek already measured: where each element is, what it paints, what each text says and in which face, what of the slide no shape can draw. And it lacks a check: an agent that writes a PPTX by hand cannot see it, and nothing tells it that a slide lost a text or kept a picture of itself.

A library of the agent's own was tried first. pptxgenjs 4.0.1 writes a real title box PowerPoint lists the slide by, tables, and preset shapes, but its theme's colors are Office's and cannot be the deck's, it would be a dependency dek's export has none of (ADR 8), and the agent would write again what dek's own writer already gets right: theme fonts by face, the title, notes, pictures stored once.

## Decision

**dek's own writer writes the rebuilt file, from JSON the agent writes.** The JSON is what `dekc pptx` would write, `PptxDeck`, in a form made to be written by hand or by a script: sizes in the slide's own pixels, colors as `#rrggbb`, pictures as files by their path from the deck's folder, and every field with a default left out. Its schema is `pptxJsonSchema`; a field it does not know is refused, so a misspelled one is found.

**`dekc pptx [deck] spec`** writes `.cache/pptx/` in the deck's folder, over what was there, for one deck:

- `deck.pptx.json`: the file `dekc pptx` would write, as that JSON, to start from and to take the theme's faces from.
- `deck.pptx.schema.json`: the JSON Schema of it.
- `spec.json`: per slide, its `slug`, `title`, `layout`, the `notes` `dekc pptx` would write, its `shot` as the browser drew it, and its `outline`: its elements in reading order, nested as in the HTML, each with its box, what it paints (fill, borders and their dashes, radius, padding, outline, shadow, rotation, opacity), its heading level, `decoration` under `aria-hidden`, and its text. A text has all its characters in `content`, its `lines`, its `align` as the lines sit in the box, flexbox centering included, and its `runs`, each with its size, weight, color, letter spacing, font token, and `face`, the faces `dekc pptx` found the browser drew it in. Its `widen` is how much wider the same text is set without the font's features, kerning, and the browser's spacing of punctuation, which PowerPoint does not apply: the width a box sized to its text needs there. What `::before` and `::after` write, counters counted, is a node of its own with its box. An element is a node when it paints, sets text, is a picture, is a list, table, figure, heading, or code that holds a node, or holds two nodes; an inline element that draws a box around its text, a chip, is a node too, marked `inline`, its text kept in its line's. `source` is a hash of the deck's script, slides, and theme.
- `parts/`, each named by a node's `part`: an image, canvas, or SVG drawn whole, and paint a shape cannot draw, such as a gradient, a clip-path, a mask, a filter, a transform, or a pseudo-element's box, drawn alone without the elements and text inside it, its `drawn` saying which.
- `shots/` and `pictures/`, which the two JSON files name.

`--json` returns `action: "spec"`, the paths of `spec.json` and `deck.pptx.json`, and the counts of slides and parts.

**`dekc pptx [deck] --from <file> [--shot]`** reads the JSON, refuses it when it is not that shape or names a file not in the deck's folder, writes `dist/<deck>.pptx` with dek's writer, and checks it against `spec.json`. `--json` returns `action: "from"`, `outs`, `diagnostics`, and `skipped`. An error fails the run, as lint's do, and the file is written all the same, as `dekc build` writes a deck with errors: the next run starts from it. The diagnostics:

| id | severity | finds |
| --- | --- | --- |
| `pptx-slides` | error | slides missing, added, or out of the deck's order, by `slug` |
| `pptx-title` | error | a slide with no `prose` layer marked `title`, the box PowerPoint lists the slide by |
| `pptx-text` | error | a text the slide shows that no layer holds |
| `pptx-bounds` | error | a layer more than 2 px past the slide's edge |
| `pptx-place` | warning | a text a layer holds away from where the slide shows it |
| `pptx-picture` | warning | a slide that keeps its picture of the rest, or lays a picture over 90% of itself that the slide does not show as an image |
| `pptx-lines` | warning | text set a line a box, as `text` layers are |
| `pptx-notes` | warning | empty notes on a slide the script speaks to |

A text is found when the layers over its box, 12 px around it, hold its characters, however they are split across boxes and runs; decoration is not looked for. With no `spec.json`, or one whose `source` is not the deck's now, nothing is checked and `skipped` says so, with `dekc pptx spec` as its hint: a check against an old outline would pass a slide that changed.

**`--shot` draws each slide of the file with Quick Look**, on macOS, to `.cache/pptx/renders/`, and returns `shots`: per slide its picture, and, where `spec.json` is current and Playwright is there, `compare`, one picture of the browser's slide beside Quick Look's with the pixels that differ tinted red, and `difference`, the mean difference of the two, 0 to 255, with `differing`, the share of pixels that differ. The agent opens one picture a slide, the most different first. Elsewhere `skipped` says there is no renderer. Quick Look is not PowerPoint (`evals/pptx/results/README.md`), but it is a drawing of the file that is not Chromium's, which is what an agent that cannot open PowerPoint can look at. The renderer the PPTX eval used moves to `src/core/pptx-quicklook.ts` for it.

**What the writer learns for it.** A shape may be one of eleven of PowerPoint's preset shapes (`geometry`: ellipse, triangle, diamond, chevron, home plate, four arrows, a rectangle rounded on one side, a callout), have a dashed or dotted outline, one outer shadow, and a rotation, as a picture may; a run may carry a `highlight`; and a slide may have a `backdrop`, a picture as its background, which a recipient changes in Format Background rather than finds as a picture on the slide. `dekc pptx` itself writes none of them, so its files are as they were.

**The skill `dek-pptx` teaches the rebuild** ([ADR 105](0105-let-a-skill-for-newer-work-name-its-command-and-ask-the-installed-dek-for-it-first.md)): a script beside the deck that writes the JSON from `spec.json`, one block a `prose` layer, a box a shape with its text and what it holds grouped, parts as pictures and the slide's own part as its backdrop, then `--from --shot` until no error is left and every slide has been looked at.

**The PPTX eval measures a file made elsewhere**: `--pptx <file>` with one `--deck`, never recorded, its report naming the file and saying that a line's drift there says where PowerPoint wrapped it, not that it is wrong.

## Consequences

The rebuild an agent did by hand now starts from what dek measured and ends in a check. On `with-agents`, a first trial agent given only the skill and the deck reached no diagnostics; the eval read its file as 0.68 MB against `dekc pptx`'s 7.41, all its text PowerPoint's own against 96.6%, 0.112 runs a character against 0.286, and 378 shapes against 34. Its slides drew 8.4 of 255 apart from the browser's on average, against 1.7, mostly where PowerPoint sets Japanese wider than the browser, which spaced it with the font's features. That trial's report is what the outline, the writer, and the checks above learned from.

The JSON is a second way into dek's writer, and its shape is a contract: a field dek renames is a breaking change to every script that writes it, as a `--json` field is. The writer's types stay its own; the JSON is converted at the edge, and a test holds that layers written out and read back are the same layers.

What the JSON cannot say, the rebuild cannot have: tables, charts, gradients, and effects beyond one shadow are not in it yet, and a slide that needs them keeps a picture of that part. Each is a decision of its own, to be taken when a rebuild needs it.

`spec.json` is large, 400 kB for 13 slides, since it carries every element; an agent reads it a slide at a time. Its parts live in `.cache/`, so a rebuilt deck's JSON names files `dekc pptx spec` writes again, the same names for the same deck, and a fresh checkout runs it before `--from`.
