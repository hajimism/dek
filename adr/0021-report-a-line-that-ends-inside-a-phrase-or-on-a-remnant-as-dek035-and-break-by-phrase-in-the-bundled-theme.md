# 21. Report a line that ends inside a phrase or on a remnant as DEK035, and break by phrase in the bundled theme

Date: 2026-10-27

## Status

Accepted

## Context

A line ends wherever the browser runs out of room. Neither `script.md` nor a slide's HTML shows where that is, so an agent that writes a slide cannot see it, and a human sees it only on the screen. Two breaks read wrong on a slide, and agents make both often:

- **A line that ends inside a phrase.** Chromium breaks Japanese between any two characters by default, so a heading can read 「ビル」 / 「ド」. CSS has an answer, `word-break: auto-phrase`, which breaks between phrases where `lang` is `ja`. The sample themes set it; the bundled theme, which `dekc init` writes into every new deck, did not.
- **A paragraph whose last line is a remnant**, as 「す。」 or one short word. `text-wrap: pretty` and `balance` keep most of these away; the bundled theme set neither.

Lint decides what geometry can decide ([Agent Usability Criteria](../docs/guide/agent-criteria.md), 3). Whether a break falls inside a phrase looks like a question for a dictionary, but both `Intl.Segmenter` in Bun and the one in Chromium split 「ビルド」 into 「ビル」 and 「ド」, so neither can say where a Japanese phrase ends. A phrase model such as BudouX could, at the cost of dek's second runtime dependency and of disagreeing with the browser wherever its model differs from the one Chromium ships. Laying a text out with `width: 0` to see its phrases does not work either: Chromium breaks a phrase too long for its line between any two characters.

## Decision

**The bundled theme breaks by phrase.** `.slide` sets `word-break: auto-phrase` and `text-wrap: pretty`, and `.slide-title` sets `text-wrap: balance`, as the sample themes do. A deck owns its theme, so only decks created from now on, or with `--theme-from` a deck that has them, get these lines.

**`DEK035` reports a line break that reads wrong, as a warning, with `--visual`.** `data.kind` says which:

- `split`: the page is its own oracle. Each text of more than one line whose `word-break` is `normal` is laid out again beside itself, hidden and out of the flow, with only `word-break: auto-phrase` changed. Every copy goes in before any is read, and all are taken away before the page is shot. Where the copy starts its lines elsewhere, a line of the page ends inside a phrase: a break at a phrase boundary is one `auto-phrase` would also take, so the two layouts part only at a break inside a phrase. `data.phrased` holds the lines the copy breaks into. Nothing else changes on the copy, so text that `overflow-wrap: anywhere` lets break, as `DEK030`'s hint suggests for a URL, breaks the same both times and is never reported; neither is a language Chromium has no phrases for, nor a phrase too long for any line. The finding goes to `theme.css` when `.slide` does not break by phrase, and to the slide when a rule takes it away from that text.
- `short`: a paragraph's last line holds two letters or digits or fewer. A line a `<br>`, a block, or a newline `white-space` keeps starts is the author's, and passes. An inline box counts as the text it holds.

Code, SVG, MathML, and decoration under `aria-hidden` are not measured. A text with a phrase broken reports only that, since breaking it by phrase moves every line after the break. The findings are kept in `.cache/visual` like every other page measurement, under a new page action, `breaks`.

## Consequences

An agent learns where a line breaks without opening a shot, and a deck made before the bundled theme changed is told the one line that fixes every slide. A fresh project and the sample decks lint clean.

`--visual` lays each text of more than one line out once more, and every cached measurement is taken again once, since the code that measures is part of every key. The rule says nothing about English or any language Chromium does not break by phrase: a line there that ends badly is left to `text-wrap: pretty`. The two-letter threshold is a judgment; it is a warning, so it never fails a deck.
