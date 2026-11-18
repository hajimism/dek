# What to open in PowerPoint

[日本語](./README.ja.md)

`dekc pptx` sets text again as PowerPoint will draw it, and what PowerPoint does with it is taken on trust: the eval measures the file in Quick Look and in Chromium, and neither is PowerPoint ([ADR 98](../../../adr/0098-space-a-pptx-s-characters-as-the-browser-s-features-did-name-a-face-a-script-and-deflate-the-file.md)). This project is three slides that show at a glance what was taken on trust. Build the file and open it in PowerPoint when the way text is set changes, and before a release that changes it:

```bash
cd evals/pptx/hand-check
bun ../../../src/cli.ts pptx
```

The file is `decks/hand/dist/hand.pptx`. Every slide is PowerPoint's own shapes and text, with no picture under them, so what is on screen is what PowerPoint drew. A yellow bar is a shape as wide as the browser set the line that lies on it.

## First: the file opens

PowerPoint opens the file without offering to repair it. Quick Look opens files PowerPoint repairs, and nothing in CI checks the file against the ECMA-376 schemas, so this is the one check that it is well formed as PowerPoint reads it. If it offers a repair, say what it reports and which version of PowerPoint.

## Slide 1: a line ends where its bar ends

| Line | It is right when | If it is not |
| --- | --- | --- |
| 「台本」から、（発表）まで。 | The line starts at the bar's left end and ends at its right end, and no bracket touches the character beside it. | PowerPoint does not add a run's character spacing after each character, the last one too. |
| 覚える書き方は三つだけです。… | The line ends at the bar's right end. | Longer: the same. Shorter: PowerPoint kerns kana, which the spacing already carries. |
| AVATAR To We Type 1,234.56 | The line ends at the bar's right end. | Longer than the bar: PowerPoint does not kern a run that names no size to kern from. PowerPoint 16.115.1 for Mac does kern it, and ends the line at the bar ([ADR 100](../../../adr/0100-name-the-face-that-drew-a-pptx-s-text-where-its-family-has-several-on-that-side-of-bold.md)). On another version or platform, select the line, open Format, Font, Character Spacing, and turn "Kerning for fonts" on from 1 point: say whether the line then ends at the bar, with the PowerPoint version and the platform. That answer decides whether `dekc pptx` writes `kern` ([ADR 98](../../../adr/0098-space-a-pptx-s-characters-as-the-browser-s-features-did-name-a-face-a-script-and-deflate-the-file.md)). |
| 字間をあけた行 SPACED | The line fills the bar. | Character spacing is set otherwise than `letter-spacing`. |
| 右に寄せた行。 | The line ends at the bar's right end. | PowerPoint leaves the last character's spacing out of a line's width. |
| （中央に寄せた行） | The line is centered on its bar. | The same, or an opening bracket's own room is counted otherwise. |

## Slide 2: a paragraph breaks where the browser broke it

- The card's paragraph ends its first line on 「持っている。」, and its text ends inside the card.
- The list is one text box with three bullets; its second item is two lines. Each bullet stands where `dekc shot hand blocks` draws it, and the card's text is no lower than there. Quick Look draws the bullets about 20 pixels further left, which is its own doing if PowerPoint does not.
- The paragraph beside the card is one text box of four lines or fewer that end on phrases, as `dekc shot hand blocks` draws them.
- The slide's heading is its title: it is named in the outline (View, Outline View), and the accessibility checker (Review, Check Accessibility) reports no missing slide title.
- "02 / 03" at the lower right is text that can be selected.
- Type a few words into the middle of the paragraph beside the card: it wraps at the box's width.

## Slide 3: each script in its own face, each weight the browser's

- In the first line, `code:` is in Menlo and 台本 in Hiragino Sans, and the dash, the arrow, and the multiplication sign look as they do in `dekc shot hand faces`.
- "Medium 500" is in Helvetica Neue Medium, and ends where its bar ends.
- The five lines from "Weight 400" to "Weight 800" each end where their bars end, and each is heavier than the one above it. Select one: the font box names its face, "Hiragino Sans W5" for the second, and Bold is on from 600 up. A family with more weights than regular and bold is drawn in whichever of them a renderer takes bold to mean, so each run names the face Chromium drew ([ADR 100](../../../adr/0100-name-the-face-that-drew-a-pptx-s-text-where-its-family-has-several-on-that-side-of-bold.md)). Where a line ends off its bar, PowerPoint did not find the face by that name: say which line, the name in the font box, and the PowerPoint version and platform.

## Measuring the same file in Quick Look

```bash
bun scripts/pptx-eval.ts --deck evals/pptx/hand-check/decks/hand
```

run from the repository's root, draws the three slides in Quick Look and says how far each line is from the browser's. Quick Look kerns whatever a run says, so its "AVATAR" line says nothing of PowerPoint's.
