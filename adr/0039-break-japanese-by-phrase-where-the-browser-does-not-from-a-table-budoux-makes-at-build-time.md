# 39. Break Japanese by phrase where the browser does not, from a table BudouX makes at build time

Date: 2026-11-09

## Status

Accepted

## Context

[ADR 20](0020-report-a-line-that-ends-inside-a-phrase-or-on-a-remnant-as-dek035-and-break-by-phrase-in-the-bundled-theme.md) has the bundled theme break Japanese by phrase with `word-break: auto-phrase`, and `DEK035` checks it in Chromium. Every page dek draws itself is drawn in Chromium: shots, the PDF, the PPTX pictures, the video. The built HTML and the dev player are not. They open in whatever browser the audience has, and a deck's link is opened on a phone more often than anywhere else. Safari 27 and Firefox do not support `auto-phrase`. They drop the declaration as an unknown value and break between any two characters, so 「スライド」 reads 「スライ」 / 「ド」 there. On an iPhone every browser draws with WebKit, so this is what almost everyone opening a shared deck on a phone sees. Lint cannot see it, since it measures in Chromium.

A spike measured the three sample decks in Japanese, 42 slides, in Chromium 156 and in Playwright's WebKit 27.2, which reports `CSS.supports("word-break", "auto-phrase")` false as Safari does:

- WebKit as the deck is now broke 38 lines inside a phrase, as BudouX finds the phrases. With a `<wbr>` where each BudouX phrase starts and `word-break: keep-all`, it broke none.
- At the widths the slides have, Chromium's `auto-phrase` never broke where BudouX finds the inside of a phrase: 0 of 54 breaks.
- Anything put between two characters changes Chromium's pixels, though not its line breaks: a `<wbr>`, a comment, a zero-width space, or splitting the text node in two. 41 of 42 shots changed by antialiasing alone. Joining the text nodes again with `normalize()` put every pixel back. An attribute on an element, with nothing between characters, changed none of the 42.
- `keep-all` with `overflow-wrap: break-word` breaks a phrase too long for its line where it must, as Chromium does. In a sweep of narrow widths this put 「、」 or 「。」 at the start of a line 34 times where Chromium did not; at the slides' own widths it did not happen.

ADR 20 ruled BudouX out as the judge for `DEK035`, since a second model would disagree with the one Chromium breaks by. That reason does not reach this use: here BudouX decides only where Chromium does not decide at all. [ADR 25](0025-read-every-attribute-value-as-the-browser-does.md) prefers small vendored code to a runtime dependency. The `budoux` package on npm depends on linkedom and commander, for its HTML processing and its command line. The part that finds phrases is a parser of about a hundred lines and a Japanese model of 2,850 scores.

## Decision

**For a deck whose `lang` is Japanese (`ja`, or `ja-` and a region), the build stamps each slide with where its Japanese breaks into phrases, and the player puts a `<wbr>` there only in a browser without `auto-phrase`.** The built HTML and the dev player's pages carry it. Shots, the PDF, the PPTX, and the video do not: Chromium draws them, and their HTML and CSS stay byte for byte as they were, so `.cache/visual` keys do not change.

- **A run** is the text a slide shows between two places that end one: the start or the end of an element not in a line, a `<br>`, or an element whose text is left out. It goes on through inline elements (`a`, `b`, `em`, `ruby`, `span`, `strong`, and the like), so 「台本を<strong>先に</strong>書く」 is one run. It goes past ruby readings without their text, and across comments. The text of `code`, `kbd`, `samp`, `pre`, `script`, `style`, `template`, `textarea`, `noscript`, `svg`, and `math` is not in any run. The build and the page both decide by tag names, from one module, `src/core/phrase-runs.ts`, since the build has no browser.
- **The table** is `data-dek-phrases` on the slide's `<section>`: JSON whose keys are a run's length and a 32-bit FNV-1a hash of its UTF-16 units, and whose values are BudouX's offsets into the run. The build reads a run's text as the text node holds it: character references decoded as text decodes them (a legacy name without `;` by its longest prefix), a carriage return as a line feed, a NUL dropped, white space as written. A table holds only what follows from a run's own text, so a run the page reads and the table does not hold, as on markup the parser repairs or text a script changed, is left as it is. A wrong break cannot come from it. A slide with no Japanese run that BudouX breaks has no attribute.
- **The page.** At the start of the player, before the rail and the next slide clone any slide, and again when the dev server swaps a slide in, `breakPhrases` checks `CSS.supports("word-break", "auto-phrase")`. Where it is false, it puts a `<wbr>` at each offset and takes the table off the slide, so a slide is broken once.
- **The CSS.** The deck's stylesheets, as the built HTML and the dev player hold them, get `keep-all` before each `word-break: auto-phrase`, with its `!important` if it has one: `word-break: keep-all; word-break: auto-phrase`. Chromium reads the later value, as before. A browser without `auto-phrase` drops it and keeps `keep-all`, and so breaks Japanese only at the `<wbr>`s. They also end with `@supports not (word-break: auto-phrase) { .slide { overflow-wrap: break-word; } }`, so a phrase too long for its line still breaks. That rule goes into every deck in Japanese, whether its CSS says `auto-phrase` or not, and reaches only a browser without `auto-phrase`, where a word too long for its line, such as a URL, now breaks instead of running out of it. The rewrite follows the author's own declarations, so a deck made before ADR 20, without `auto-phrase`, gets no `keep-all` and breaks between any two characters as before, `<wbr>`s or not; `DEK035` already tells it what to add.
- **BudouX is vendored** in `src/core/budoux/`: the parser adapted to dek, with a notice of what changed, the Japanese model generated by `bun scripts/budoux-model.ts` from the release that `VERSION` names, and the Apache License 2.0 as `LICENSE`. Its code runs only in `dekc`. A deck carries offsets, never BudouX.

No key in `dek.toml` or the frontmatter turns this off. The pages Chromium draws do not change, and a page in another browser only gains break opportunities where a phrase starts.

**What was not chosen:**

- **BudouX in the player**, run on the page where `auto-phrase` is missing. It would need no table and would reach text a script writes later. It costs 37.5 KB minified, 15.8 KB gzipped, in every Japanese deck. It also puts Apache-licensed code into every file a user hands out, which would have to carry the license with it.
- **`<wbr>` written into the HTML at build time.** Chromium would draw differently, by antialiasing, in 41 of the 42 slides, and it is the version everything else is measured on.
- **The `budoux` package as a dependency**, which brings linkedom and commander along for parts dek does not use.
- **`keep-all` on every `.slide` under `@supports not`.** It cannot tell a `word-break` the author set to `normal` on purpose from an `auto-phrase` the browser dropped, which the per-declaration fallback follows exactly.

## Consequences

A deck in Japanese reads by phrase in Safari and Firefox as it does in Chromium, without a change to the deck. Shots, lint, the PDF, the PPTX, and the video are untouched. The breaks are by phrase but not always the same breaks as Chromium's: in the spike, WebKit broke exactly where Chromium did on 26 of the 42 slides, and on the rest broke at a different phrase boundary. A shot is still the slide as Chromium draws it, not as every viewer sees it.

Built with this change, the three sample decks draw all 42 slides in Chromium pixel for pixel as they did before it, the rewritten CSS included. The build parses each slide once more for its runs. The built HTML grows by a few bytes for each run, 3 to 9 KB for each sample deck, the player's 1.6 KB included. A run whose text a slide script writes after the page loads gets no `<wbr>`, and breaks only where `keep-all` and `overflow-wrap` let it. `overflow-wrap: break-word` can start a line with 「、」 where a phrase is longer than the line, in those browsers only.

dek now carries third-party code, under its own license file. Updating the model means changing `VERSION` and running the generator. A test checks the WebKit result, but only where WebKit is installed: CI installs Chromium alone, so it runs on a developer's machine until CI installs WebKit too. When Safari ships `auto-phrase`, the page sees it and stops adding `<wbr>`s with no release of dek.
