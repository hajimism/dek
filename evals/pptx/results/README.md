# PPTX eval results

[日本語](./README.ja.md)

Each file here is one record of the PPTX eval, kept so that what `dekc pptx` writes can be compared from one change to the next. The eval writes each sample deck's `.pptx` with the checkout it runs in, reads the file back as a recipient's PowerPoint would, and, on macOS, has Quick Look draw every slide and compares it with the browser line by line. Make a record from the checkout to measure:

```bash
bun scripts/pptx-eval.ts --record evals/pptx/results
```

and commit the file it writes, `<date>-v<version>.json`, as it is. The date is the day the eval started in UTC, and the version is package.json's. `commit` is the checkout it measured, with `+changes` when `src/` or `sample/` were not as that commit has them. A second record on the same day and version gets `-2`, `-3`, and so on, never overwriting the first. It needs Playwright, and takes about a minute and a half for the three sample decks. The full report, with every slide's pictures and each line's numbers, is in `.cache/pptx-eval/<time>/`; `--deck <dir>` measures other decks, and `--no-render` leaves Quick Look out.

## What a record keeps

For each deck, and for all of them together, with no paths and no pictures:

- **What the file holds**, read from the file alone. Shares are of the characters the slides show, white space and `aria-hidden` decoration left out, text that `::before` and `::after` draw included.
  - `native`: text the file holds as text.
  - `whole`: text whose whole block is one paragraph of the file, so a recipient selects and retypes it as one.
  - `wrapping`: of that, text in a box that wraps what is typed into it.
  - `editability`: one number for the three: a character in a wrapping whole block counts 1, in another whole block 0.7, in a line or a piece of one 0.4, and in a picture 0.
  - `runsPerChar`: runs for each character of text. Many small runs make a paragraph harder to restyle, which `editability` does not see.
  - `shapes`, `pictures`, `effects`: what is PowerPoint's own besides text.
  - `rasterSlides`, `coverage`: slides that keep a slide-sized picture, and the mean share of the slide it covers.
  - `backdropSlides`: slides whose background is a picture, such as a texture, which a recipient changes in Format Background rather than finds on the slide. `dekc pptx` writes none; a file built again with `dekc pptx --from` may.
  - `titled`, `numbered`, `links`: slides with a heading whose file has a title placeholder, slides numbered by a field, and links kept of those shown.
  - `problems`: parts that do not parse, relationships that point nowhere, parts with no content type, shape ids used twice.
- **How the renderer drew it** (`render`, absent where there was no renderer). The ink of text is what differs between a slide drawn with its text and without, in the browser and in the renderer alike, so a line is found whatever it is drawn on.
  - `lines`, `native`: lines the browser set, and those the renderer set as text.
  - `drifted`, `causes`: lines whose end is more than a pixel and more than 1% of their width from the browser's, and why: the renderer broke the line again (`rewrapped`), or its width came out other, in a line of East Asian text, of other text, or of both (`mixed`).
  - `driftMedian`, `drift95`, `driftMax`, `relative95`: how far a line's end is from the browser's, in pixels and of its width.
  - `riseMedian`: how far a line's top is from the browser's.
  - `match`: the share of each drawing's ink that lies within a pixel of the other's.
  - `difference`: the mean difference between the two whole pictures, of 255.

## How to read one

**Quick Look is not PowerPoint.** It is the renderer every Mac has, and it is not Chromium, so it shows what a file's own text and shapes do where the browser is not there to draw them: a line that runs long, a paragraph that wraps elsewhere, a line break that is missing. It also has habits PowerPoint does not share. It wraps a shape's text even where the file says not to, which is most of `rewrapped`. And it sets type in whole points: a 10.5 pt run is drawn at 10 pt and a character spacing of 0.4 pt not at all. The eval works around the second by having it draw a copy of each slide magnified 32 times, where a point is a twenty-fourth of a slide's pixel. `src/core/pptx-quicklook.ts` says how. Two more habits are not worked around. It drops one space from the start of every line, which is why `dekc pptx` leaves a line that starts with an indent in a box of its own. And it draws a list's bullet further left than the file says, by as much again as the bullet is hung; PowerPoint draws it where the file says. The eval counts no bullets, so its numbers do not see this. And it kerns whatever a run says. What Quick Look says about kerning, or about where a font's own metrics put a line, is Quick Look's answer. A change to how text is set is still opened in PowerPoint by hand ([ADR 8](../../../adr/0008-export-a-talk-as-pptx-with-editable-text-over-a-picture-of-each-slide.md)): [`evals/pptx/hand-check/`](../hand-check/README.md) is three slides made for that, and says what to look for.

**Compare records made on the same kind of machine.** The fonts a machine has decide how the browser sets a line and what the file names, and the macOS version decides which Quick Look drew it; a record names the renderer and not the machine, so say which machine in the commit message. Off macOS a record has no `render`, and that is not a pass: nothing was measured.

**The numbers pull against each other.** A line laid where the browser set it, in a box that never wraps, drifts least and is edited worst; a paragraph PowerPoint wraps is edited best and can break where the browser did not. Read `drifted` with `whole` and `wrapping`, and `editability` with `runsPerChar`.
