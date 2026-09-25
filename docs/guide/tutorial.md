# Tutorial

In this tutorial you build a short talk from scratch: a ten-minute lightning talk about a bug that turned out to be a design flaw. By the end you will have a script with beats, a hand-written slide that reveals itself in step with your speaking, a figure that carries over between two slides, a theme change that stays inside the rules, and a single HTML file you could present from a USB stick.

Every step ends in a state you could stop at and still give the talk. That is deliberate. dek is designed so that the script alone is enough, and everything after it is optional polish.

You need [Bun](https://bun.sh) 1.4 or later. Voice, video, and Playwright are not used here.

## 1. Create the project

```bash
bunx github:hajimism/dek init lightning --deck postmortem
cd lightning
bun add -d github:hajimism/dek
cd decks/postmortem
```

These are the steps `init` prints when it finishes. From here on, `dek` means `bunx dek`, which runs the dek installed in the project.

## 2. Write the script

Replace the contents of `script.md` with the talk. Write it the way you would say it out loud. Do not think about slides yet.

```markdown
---
# yaml-language-server: $schema=../../.dek/schema.json
title: The Bug That Was a Design
event: Lightning Talks
date: 2026-05-14
duration: 10m
---

## intro

Last month we shipped a bug that took three days to find.
I want to tell you why it took three days, because the reason
was not the code.

> Slow down. Let the first sentence land.

## What we saw {#symptom}

Users in one region saw stale prices. Not wrong prices. Stale.
Five minutes behind, every time, only there.

## Where we looked {#search}

We looked in the obvious places, in the obvious order.

### The cache {#cache}

First the cache. It was fine.

### The queue {#queue}

Then the queue. Also fine.

### The clock {#clock}

Then the clock on one host. Five minutes slow.

## Why it took three days {#cause}

The clock was the bug. But the reason it took three days
was that nothing in our system could tell us which host had
served the request. That is not a bug. That is a design.

## What changed {#fix}

We did not fix the clock first. We made every response say
where it came from. The clock took ten minutes after that.

## Take one thing home {#close}

When a bug is hard to find, ask what the system refused to tell you.
```

A few things to notice.

- `## intro` qualifies as an id on its own, so it needs no `{#...}`. The other headings contain spaces and capitals, so each carries an explicit `{#id}`. The id names the HTML file; the heading text is what the audience and the presenter view see.
- The `###` headings under `## Where we looked` are **beats**. They split your speaking into three moments. Right now they do nothing visual, and that is fine.
- The blockquote is a direction to yourself. It is never spoken, never counted, and never shown to the audience.

## 3. Start the dev server

```bash
dek
```

The server prints a URL. Open it. You have six slides. Each one was generated from a heading: the first shows the deck title, the others show their heading text, and `search` lists its three beats.

Press the right arrow. On `search`, the three beats appear one at a time before the deck moves on. Press `p` to open the presenter view: your script for the current section is on screen, the current beat is highlighted, and the clock starts when you first advance.

Look at `slides/search.html`. This is what the server wrote for you.

```html
<section class="slide" data-layout="default">
  <h2 class="slide-title">Where we looked</h2>
  <ul>
    <li data-step="cache">The cache</li>
    <li data-step="queue">The queue</li>
    <li data-step="clock">The clock</li>
  </ul>
</section>
```

Each list item points at a beat by id through `data-step`. When you advance to a beat, the player marks every element for that beat and the ones before it as shown. The theme decides what "shown" looks like.

::: tip You could stop here
Run `dek build` and you have a presentable deck. Everything that follows is about making the screen say more than the script does.
:::

## 4. Check your timing

In a second terminal, from the deck directory:

```bash
dek ls
```

You see the budget from `duration`, an estimate from the word count, and the per-section split. dek estimates Latin text at 130 words per minute and CJK text at 300 characters per minute. Blockquotes are not counted. The script in this tutorial reads in about a minute, so `dek ls` ends with `1 diagnostic`, and `dek lint` and the dev server show what it is: a DEK041 warning that the script is short of its ten-minute budget. That warning is the point: it is your cue to write more script, not more slides. It is a warning, not an error, so lint still passes. Anything you plan to say out loud belongs in the file, because only then does it count.

## 5. Write one slide by hand

The `cause` slide carries the point of the talk. Give it a real layout. Open `slides/cause.html` and replace the skeleton.

```html
<section class="slide" data-layout="two-col">
  <h2 class="slide-title">The clock was the bug. The silence was the design.</h2>
  <div class="col">
    <p class="node">cache</p>
    <p class="node">queue</p>
    <p class="node node-parent">clock: −5 min</p>
  </div>
  <div class="col">
    <p class="node">response</p>
    <p class="node node-parent">served-by: ???</p>
  </div>
</section>
```

Save it. The browser updates only that slide. Every class you used is defined in the bundled theme: `slide-title`, `col`, `node`, `node-parent`. Try adding a class the theme does not know, such as `class="node highlight"`, and save. The terminal and the browser overlay both report `DEK010`: the class is not in `theme.css`. Remove it and the diagnostic disappears.

That is the loop. Write, save, read the diagnostic, fix. The dev server lints on every save, and "no diagnostics" is what finished looks like.

## 6. Reveal in step with your speaking

The `cause` slide has no beats yet, so both columns appear at once. Add beats to the script so the right column arrives when you say "nothing in our system could tell us".

Edit the `cause` section in `script.md`:

```markdown
## Why it took three days {#cause}

The clock was the bug. But the reason it took three days
was something else.

### What the system knew {#knew}

It knew the cache was fine, the queue was fine, and one clock was slow.

### What it refused to say {#silent}

But nothing in our system could tell us which host had served
the request. That is not a bug. That is a design.
```

Now bind the columns to the beats in `slides/cause.html`:

```html
<section class="slide" data-layout="two-col">
  <h2 class="slide-title">The clock was the bug. The silence was the design.</h2>
  <div class="col" data-step="knew">
    <p class="node">cache</p>
    <p class="node">queue</p>
    <p class="node node-parent">clock: −5 min</p>
  </div>
  <div class="col" data-step="silent">
    <p class="node">response</p>
    <p class="node node-parent">served-by: ???</p>
  </div>
</section>
```

Advance through the slide. The left column appears on the first beat, the right on the second. The script decides *when*; the theme decides *how*. The bundled theme fades and lifts each element into place, and it hides them with opacity rather than `display: none`, so the layout never shifts between beats.

You referenced the beats by id, not by number. If you later insert a beat in the middle, nothing here breaks. The `dek sync` skeleton uses the same ids, which is why it is worth naming beats with `{#id}` before you start writing HTML.

## 7. Carry a figure across slides

The `fix` slide should pick up the `served-by` node from `cause` and turn it into the answer. Give the element a `data-morph` name on both slides and the browser interpolates its position and size during the transition.

In `slides/cause.html`, change the last node:

```html
<p class="node node-parent" data-morph="served-by">served-by: ???</p>
```

Replace `slides/fix.html`:

```html
<section class="slide" data-layout="default">
  <h2 class="slide-title">Make every response say where it came from</h2>
  <p class="node node-parent" data-morph="served-by">served-by: host-07</p>
  <p class="node">Then fix the clock. Ten minutes.</p>
</section>
```

Step from `cause` into `fix`. The `served-by` box slides from the right column into its new position instead of fading out and back in. No animation code was written. `data-morph` becomes a `view-transition-name`, and the browser's View Transitions API does the rest.

If you have Playwright installed, you can freeze the transition halfway to judge the motion:

```bash
dek shot cause --to fix --at 0.5
```

## 8. Change the look, within the rules

The default theme is dark. Make this deck warm instead. Open `theme.css` inside the deck (not the one at the project root) and change three tokens in the `.slide` block:

```css
.slide {
  --fg: #2b1d12;
  --bg: #f6efe6;
  --accent: #b5471f;
  /* the other tokens stay as they are */
}
```

Save. Every slide re-renders in the new palette. Nothing else in the file needed to change, because every color in the theme is written as `var(--fg)`, `var(--accent)`, and so on.

Now try to cheat. Add a raw color to a rule:

```css
.slide .node-parent {
  border-color: #ff0000;
}
```

Save, and lint reports `DEK014`: a raw value outside a token assignment. Raw colors, font families, and absolute units may only appear when assigning a `--*` custom property. Everything else goes through `var()`. Change it back to `var(--accent)` and the deck is clean again.

This deck's theme is its own copy. The `theme.css` at the project root is untouched, and so is every other deck. When you like the result, promote it:

```bash
cp theme.css ../../theme.css
```

The next `dek new` starts from the warm palette.

## 9. Build the file you will present from

```bash
dek build
```

You get `dist/postmortem.html`: every slide, the theme, the player runtime, and any images folded into one minified file. Open it in a browser. Arrow keys move through beats and slides. Press `p` for the presenter view, and open the same file in a second window: the two follow each other through `BroadcastChannel`, so you can put the audience view on the projector and the presenter view on your laptop with no server and no network.

Copy that one file to a USB stick. That is the talk.

## Where to go next

You have used the whole core of dek: a script that owns order and timing, one HTML file per slide, beats bound by id, a morph between slides, a token-only theme, lint as the definition of done, and a single-file build.

- The detailed rules for each piece: [The Script](./script), [Slides](./slides), [Beats](./steps), [Themes](./theme), [Lint](./lint)
- Presenter view, remote control, and PDF: [Presenting](./present)
- Synthesized narration, rehearsal, and video: [Voice and Video](./voice)
- Letting an agent do steps 5 through 8: [Working with AI Agents](./ai)
