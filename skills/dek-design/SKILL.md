---
name: dek-design
description: Make dek slides that read at a glance - a heading that states a claim, one focal point, and no visual difference without a meaning. Use when writing or reviewing the look of slides in a dek deck, or when a deck lints clean but still looks off.
---

# dek-design

The audience sees a slide, holds it in mind, then understands it. Make each step cost as little as it can. Lint measures overflow and contrast; this skill is for what it cannot measure. Use only the classes, tokens, and layouts `bunx dekc theme` lists.

## Before you start

- Projected or read: a talk is spoken, so the words live in `script.md` and a slide shows what the voice cannot. A deck sent to be read alone needs sentences that stand without the speaker.
- What the audience knows: do not use a term they do not know. If you must, tie it to something they do.

## One slide

- The `##` heading is the slide's claim, in one sentence: "Builds fail on cold caches", not "Problems". Read in order, the headings tell the whole talk.
- The body is the evidence for the heading. Show it as a figure, a chart, or a short table where you can.
- Keep about four groups on a slide at most. With more, nest them or split the slide.

## How it looks

- One thing stands out most on each slide, and it is the main point. Emphasis used everywhere is emphasis nowhere.
- Change color, type, or layout only when the meaning changes; the audience looks for a reason in every change, so never vary for variety. Mark sections with one layout used the same way each time.
- When things differ, make them differ clearly. A small difference is not seen as one.
- Line things up. Items side by side share their top, their bottom, and the line their text starts on; a row of cards is one height even when one holds less. Items stacked share their left edge. An edge a little off reads as a mistake, not a choice, and a shot shows it where markup does not.
- What sits close, aligns, or shares a color reads as one group. Do not set items of different rank as a row of equal cards.
- Position means something: time and steps run left to right, more or better goes up, the general sits above the specific. A person or anything with a direction faces into the slide or toward what it points at.
- The eye goes from the heading at top left, to the body in the middle, to the conclusion or next step at bottom right.

## Charts

- A line for a trend, bars to compare values. Show amounts by position or length, not by area, angle, or hue.
- Label lines and bars directly instead of using a legend. Put each note next to what it explains.
- No icon or picture that only decorates.

## Check

1. `bunx dekc ls <deck>` lists the headings in order. Read only them: does the talk hold?
2. `bunx dekc shot --sheet`, then each slide's own shot: where does the eye land first, and is that the main point? Read `fill` in `bunx dekc check <slug> --json` for where the slide is empty.
3. In each slide's shot, edges line up: in a row, tops, bottoms, and the first lines of text; in a column, left edges. Fix any that do not.
4. Every difference in position, color, size, and look has a reason you can say. Remove the ones that do not.
