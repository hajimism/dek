# The Script

`script.md` holds three things and nothing else: the order of the talk, the words you will say, and how long you have. Layout and decoration belong to the slide HTML. Voice belongs to `voice/`. The script knows about neither.

## Three rules

There are three rules to remember. A `##` heading is one slide. Everything under it is that slide's script. Only paragraphs are spoken.

Only `##` and `###` (a beat, below) mean anything. A `#` or `####` heading is read as script text, and lint warns about it as `DEKC044`. A heading inside a fenced code block or an HTML comment is text too, so a talk about Markdown can quote `## Title` in a code block.

```markdown
---
# yaml-language-server: $schema=../../.dekc/schema.json
title: How I Built an HTML Slide Tool
event: Tokyo Frontend Meetup #42
date: 2026-04-18
duration: 20m
---

## intro

Hi. Today I want to talk about building my own slide tool.

> Keep the introduction short. Do not look at the clock.

## What do you do the day before a talk? {#problem}

What do you do the day before a talk?

Keep going until the audience feels it is about them. The third example is the real one.

## architecture

This is the one thing I want you to take home.

### The script is the parent {#script-parent}

First there is the script.

### Slides hang off it {#slides-hang}

The slides hang off it. Never the other way around.
```

Heading text is free-form. Write it in any language, as a question, with punctuation. The presenter view shows each section's Markdown as written, with the line breaks inside each paragraph joined.

Only paragraphs become speech. Blockquotes, lists, code blocks, and tables are for the screen or for your own direction; they are never synthesized. Inline emphasis, links, and `code` are flattened to plain text before synthesis. None of this affects the live presentation. It only matters once you run `dekc cues` or add voice. A beat with a list but no paragraph is visible on screen yet passes in an instant when narrated, so `dekc cues` and lint on a deck with `voice/` warn about it as `DEKC042`.

Use a blockquote for stage directions. Once you add narration this becomes a convention worth keeping, and `dekc build --public` leaves blockquotes and HTML comments out of its presenter view (see [On the web](./present#on-the-web)). dekc has no fuzzy rule for detecting directions, such as "short imperative sentences", and no special syntax for pauses. Timing adjustments for narration live in `voice/voice.toml`; see [Timing](./voice#timing).

## Headings and ids

Files in `slides/` and the `<slug>` arguments to the CLI use the section **id**. The presenter view uses the heading **text**. An id matches `[a-z0-9-]+` and contains at least one letter; a digits-only id would collide with numeric `data-step` values.

dekc separates display from identity with Pandoc-style `{#id}`.

- If the heading already qualifies as an id, it is the id. `## intro` becomes `slides/intro.html`.
- Otherwise `{#id}` is required. `## What do you do the day before a talk? {#problem}` becomes `slides/problem.html`. A heading that does not qualify and has no `{#id}` is an error (`DEKC027`) that points at the line and shows the fix, and lint reports every such heading in one run: `## Why dekc? {#why-dekc}` when the heading has ASCII words to build an id from, `## まとめ {#your-id}` when it has none.
- A qualifying heading may still carry `{#id}` when you want the display name and the file name to differ. `## intro {#opening}` is displayed as "intro" and stored as `opening.html`.
- A heading that is only an id has no display text. The generated skeleton leaves its `<h2>` empty, except for the first section, which takes the deck `title`. The presenter view shows the id.

Only `{#id}` is supported. `{.class}` and `key=value` attributes are rejected. Section ids must be unique within a deck; beat ids must be unique within their section.

## Renaming and reordering

`dekc sync` never renames a file. If you edit `## problem` to `## the-problem`, the server generates a new skeleton for `the-problem`. An old `problem.html` that is still the untouched skeleton, with no `problem.css` or `problem.ts` beside it, holds nothing the script cannot write again, so sync removes it; that is also what clears the example slides once you write your own script after `dekc init`. One you have edited stays and becomes an orphan (`DEKC002`). The link is broken; the content does not move.

Changing identity is fragile, so the CLI owns it.

```bash
dekc mv problem the-problem
dekc mv architecture --after intro
```

The first command rewrites the id in `script.md`, renames `slides/problem.html` along with its `problem.css` and `problem.ts` if present, updates `data-slug`, and rewrites matching keys in `voice/voice.toml`. It does not touch the heading text, and it refuses to run if any of the destination files already exists. Either every file changes or none does. The second moves the section in the script; HTML files stay where they are because they carry no order of their own.

You can also edit the heading first, or rename the files first, and run `dekc mv` afterwards; it finishes the rename from whichever you did. When `script.md` already has the new id, `dekc mv problem the-problem` moves only the files. When the files already carry the new id, it rewrites only the heading and moves whatever is left. A skeleton the dev server generated on save gives way to the slide you wrote, under either id. Only two slides you wrote, one under each id, stop the command, and it asks you to merge them.

When lint sees exactly one orphan (`DEKC002`) and exactly one section without its own HTML, either missing (`DEKC001`) or still the generated skeleton, it assumes a rename. Whether you renamed the heading or the file is yours to say, so the hint gives both: `dekc mv problem the-problem` to move the files to the script's id, or `dekc mv the-problem problem` to give the section the files' id. Either works as written. With more than one candidate, such as a section you added while the dev server was running, it does not pick one: the hint names a `dekc mv` for each, like `dekc mv problem the-problem` or `dekc mv problem qa`, and never suggests deleting the slide.

## Beats

If `##` is a slide, `###` is a **beat** within it: a pause in the speaking, and a moment where the screen may advance. Beat text is free-form and appears as a heading in the presenter view.

During the talk, the right arrow first steps through the beats of the current slide, then moves to the next slide. A beat does not need a matching element in the HTML. It can simply be a place where you pause, with the screen unchanged.

A slide arrives before any of its beats. The paragraphs between `##` and the first `###` are spoken as it arrives, and nothing the HTML binds to a beat is on screen yet. Each press then reaches the next `###`, so every beat, the first included, brings in what is bound to it the same way. A slide with no `###` is its arrival alone. `motion` calls the arrival `0` and each beat by its id or position. With no beats, there is nothing for `data-step` to bind; a `data-step` there is `DEKC003`.

*When* something appears is a speaking decision, so the script owns it. *How* it appears is a visual decision, so `theme.css` owns it. The HTML side is described in [Beats](./steps).

## Timing

`duration: 20m` is the budget for the talk. dekc estimates how long the script takes from its body text: CJK text at 300 characters per minute, everything else at 130 words per minute. Blockquotes are directions and are not counted. Both rates can be changed in `dekc.toml`.

`dekc ls` prints the budget, the estimate, and a per-section breakdown. Each section's budget is `duration` split in proportion to its share of the text. Without `duration`, you get the estimate alone. If a Timeline exists from voice synthesis, `dekc ls` shows the actual narrated length next to the estimate. They sit side by side and are never conflated.

A slide with a long demo and a short script will estimate short. If you plan to speak during the demo, write those words down. They then count. dekc has no notation for silent time, in the script or in configuration.

`event` and `date` appear in `dekc ls`. Nothing puts them on a slide; write them into the title slide's HTML if you want them shown.

## Next

Write the HTML for one slide: [Slides](./slides). The full list of frontmatter fields is in [Configuration](/reference/config).
