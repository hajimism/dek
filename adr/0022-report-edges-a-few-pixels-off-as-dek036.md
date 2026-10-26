# 22. Report edges a few pixels off as DEK036

Date: 2026-10-27

## Status

Accepted

## Context

An edge a few pixels off reads as a mistake, not a choice. Agents make it often: one card's `margin-top` is 1.4 gaps where its neighbor's is 1.2, a column's padding is 20px where the next one's is 24px. The markup shows nothing wrong, and an agent that reads a shot does not see a 4px difference reliably, though it would act on the number at once. `dek-design` asks for edges lined up, and [ADR 18](0018-ship-an-optional-design-skill-and-raise-the-official-skill-s-floor-to-0-2-2.md) leaves its check to the agent reading the shot.

Whether two edges line up is geometry, so it belongs in lint ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 3). The hard part is the edges that are meant to differ. A first version that compared every pair of siblings by top, middle, bottom, left, center, and right found 57 near misses in the three sample decks, and all but four were right: chips that sit on a line of text, a number and its unit on one baseline, a window turned by `rotate`, a name and a value stacked beside their swatch, tags set flush right, text centered in its lane, and a pixel of rounding.

## Decision

**`DEK036` reports two items that nearly line up and do not, as a warning, with `--visual`.** It is decided from what `--visual` already measures, each element's box and its lines of text, with three new fields on each measured element: whether it sits on a line of text (`inline`, its `display` starting with `inline`), whether a transform turns or skews it or an ancestor (`tilted`), and the baseline of its own first line, the line's top plus the font's ascent as a canvas measures it. The findings are kept in `.cache/visual` under a new page action, `alignment`.

- **Items** are the boxes in one parent: not inline boxes, decoration, what the beat has not shown, anything tilted, or the parts of a picture.
- Two items are compared only **side by side**, by top, middle, and bottom, or **stacked**, by left, center, and right. Items in a row under one item, or stacked beside it, are compared with it as the row or the stack they form, named by the member at the edge.
- Edges under **0.5px** apart are one line, under **1.5px** look like one, and **2px to 8px** apart are a near miss; farther is a choice.
- Items **line up** when they share an edge, or, side by side, a baseline, unless both are boxes the audience sees.
- Reported: two items that share no edge, where the nearest is a near miss; side by side, items that hold text whose bottoms meet and whose tops nearly do; in a row of cards (one kind, painted, holding text), one that shares the top and nearly the bottom; and cards that start on one line whose first lines of text nearly do not, unless the text is centered.
- Of the two, the one fewer others line up with is named, and the hint names the fix its edge takes: the same margin or padding for a start, one size for an end, one way of centering for a middle, one padding for text.

The one finding in why-dek that was a mistake, the refs slide's command block, is fixed in the sample.

## Consequences

An agent gets the number it can act on, and a slide whose cards are a few pixels apart no longer passes as finished. A fresh project lints clean. The sample decks lint clean but for three warnings on with-agents' annotate slide, whose mock of a planning tool sets its chevrons a few pixels off its lanes; they are real, and fixing them is a choice about that mock left to its author.

The rule sees only edges within one parent, a near miss of eight pixels or less, and a row's width never: an edge off by more, two items in different parents that should share a line, and stacked items that should be one width are still the shot's to show. A row of different items that nearly share a bottom, as a pill beside a panel, passes. Every cached measurement is taken again once, since the code that measures is part of every key.
