# Beats

A beat is a `###` heading in the script. On screen, a beat is the moment an element appears. This page covers the HTML side of that link, the transition between slides, and how to carry an element from one slide to the next. The order always comes from the script; the appearance always comes from CSS.

## `data-step`

`data-step` names the beat an element belongs to. Its value is a beat id, or a positive integer meaning "the k-th beat of this slide". The runtime does one thing: when you reach a beat, it adds `is-shown` to every element bound to that beat or an earlier one. A slide arrives before its first beat, so nothing bound to a beat is shown until the first press on it; every beat, the first included, brings its elements in the same way. The theme decides what shown and hidden look like.

```html
<div class="col" data-step="slides-hang">…</div>
<div class="col" data-step="2">…</div>
```

Prefer ids. Inserting a `###` in the middle of a section shifts every number, but an id keeps pointing at the same beat, so existing HTML survives until you choose to bind something to the new beat. Numbers and ids can be mixed on one slide without ambiguity: an integer is a position, anything else is an id.

```css
/* theme.css */
.slide.is-current [data-step] { opacity: 0; transform: translateY(0.5em); transition: var(--step-transition); }
.slide.is-current [data-step].is-shown { opacity: 1; transform: none; }
```

Fade, slide in, or anything else CSS can express: the choice belongs to whoever writes the theme. dekc adds no vocabulary of its own.

The bundled theme hides elements with `opacity` and `transform` rather than `display: none`, so the layout is identical at every beat. That is what lets `lint --visual` give the same overflow verdict no matter which beat it measures.

A beat with no bound element is fine; it is a pause in the speaking. Numbers need not be consecutive. The only error is a `data-step` that resolves to nothing, reported as [DEKC003](/reference/lint#dekc003).

## View Transitions

Moving between slides uses the browser's View Transitions API. The runtime calls `document.startViewTransition()`; the theme writes the animation.

```css
/* theme.css */
::view-transition-old(slide) { animation: fade-out var(--step-transition); }
::view-transition-new(slide) { animation: fade-in var(--step-transition); }
```

The transition's pseudo-elements hang off the page, not a slide, so on their own they would not see the theme's tokens. dekc repeats every token set on `.slide` on `::view-transition` when it serves the theme, so `var(--step-transition)` there reads the value the slides read, `@media` included. A token set on only some slides, such as under `[data-layout]` or in a slide stylesheet, stays with those slides.

The player names the slide box `slide`, so only the slide moves. The slide list, the presenter view, and the letterbox around the slide stay still, and anything that slides in from an edge is clipped to the slide. The page itself, `root`, does not animate.

## `data-morph`

To carry an element into the next slide, give it the same `data-morph` name on both slides.

```html
<!-- problem.html -->
<img class="figure" data-morph="pipeline" src="assets/pipeline.svg">

<!-- architecture.html -->
<img class="figure figure-small" data-morph="pipeline" src="assets/pipeline.svg">
```

The runtime turns `data-morph` into a `view-transition-name`, and the browser interpolates position and size between the two slides. A figure that shrinks into the corner as the next topic begins is one attribute, and both slides remain plain `<section class="slide">` fragments.

Two elements with the same `data-morph` on one slide is [DEKC005](/reference/lint#dekc005), and so is a name the player reserves, such as `slide`. A name that neither the slide before nor the slide after has morphs into nothing, which is [DEKC028](/reference/lint#dekc028), a warning with the likeliest partner in its hint.

A morph is invisible in a still image. To judge one, freeze the transition part-way and look:

```bash
dekc shot problem --to architecture --at 0.5
```

This writes one frame of the transition from the last beat of `problem` into `architecture`, stopped at 50%, to `.cache/shots/problem~architecture~0.5.<hash>.png`. Use `--at 0` and `--at 1` for the endpoints. `--at` counts along the view transition alone, so `--at 1` is where the transition ends; an entrance on the new slide can still be running there. To see all of it, use [`--motion`](#seeing-motion-in-stills). The frame comes from the same player document that `dekc video` records, so what you see is what the video shows.

The bundled theme honors `prefers-reduced-motion` and drops every animation when it is set.

## Scripted motion

When CSS cannot express a motion, such as a counter that runs, a chart that draws itself, or a canvas, put a script next to the slide as `slides/<id>.ts`. Plain JavaScript is valid TypeScript, so a script without types works as it is.

```ts
// slides/growth.ts
export default {
  motion: { growth: 1200 },            // ms of motion per beat: its id or number, "0" as the slide arrives
  draw(slide, { index, step, t }) {    // t: ms since this beat began
    const p = step === "growth" ? t / 1200 : 0;
    const bar = slide.querySelector<HTMLElement>("[data-bar]");
    if (bar) bar.style.width = `${p * 80}%`;
  },
} satisfies DekcSlide;
```

Find elements with a `data-*` attribute, such as `<div data-bar>`, rather than a class. A class exists to be styled, so one used only as a hook is `DEKC010` until a stylesheet defines it, and a class in a `querySelector`, `closest`, `matches`, or `getElementsByClassName` is `DEKC017`.

`DekcSlide` needs no import. `dekc init` and `dekc sync` write its definition to `.dekc/slide.d.ts`, and `dekc init` also writes a `tsconfig.json` that points your editor at it, so `slide` is an `HTMLElement`, `t` is a number, and a misspelled field or a Node global such as `process` is flagged as you type. `dekc sync` never creates or edits `tsconfig.json`; if your project has its own, add `".dekc/*.d.ts"` to its `include`. dekc erases the types when it builds and does not run `tsc`; lint checks what matters at run time.

`draw` is a function of time, and the runtime owns the clock:

- A forward step runs `t` from 0 to the beat's `motion` on animation frames.
- A jump, a step back, `prefers-reduced-motion`, the rail, the presenter's next preview, `dekc shot`, `lint --visual`, and the PDF all draw once, at the end.
- `dekc video` seeks `t` frame by frame alongside the Web Animations, then holds the last frame for the rest of the beat.
- A beat without a `motion` entry is drawn once, at `t = 0`.

Every copy of a slide is in the document when it is drawn, the rail and the next preview included, so `draw` may measure the slide. Measure with layout sizes such as `offsetWidth`, which transforms do not scale; `getBoundingClientRect` changes with the size of the window.

So draw from `t` alone, and set everything you touch on every call: the same `(index, t)` must give the same slide whatever was drawn before, because a jump or a step back draws only the end of the new beat. Timers, `requestAnimationFrame`, and state carried between calls break the video, because the recorder does not wait in real time. Lint reports a timer, `requestAnimationFrame`, `Date`, `performance.now`, or `Math.random` as `DEKC017`, on its line. The script must be self-contained: one module with `export default` and no imports, whose top level only defines things; touch the slide inside `draw`. Anything else is `DEKC016`, and so is a `motion` key that is not a beat of the slide. Lint evaluates the top level in a separate worker with no Node or Bun globals and stops it after a second. That keeps a mistake from reaching dekc; it is not a security boundary. dekc loads only `.ts`; a `slides/<id>.js` is `DEKC016`, asking you to rename it. `dekc build` inlines the script, `dekc mv` moves it, and saving it reloads the dev server page.

## What a still shows

Every page that shows a beat without playing it shows the beat as it ends: `dekc shot`, `lint --visual`, the PDF, and the slide a `dekc shot <a> --to <b>` frame leaves. Slide scripts are drawn at the end of their motion, and every CSS animation and transition is run to its end, so an entrance in the theme is measured and photographed where it lands, not on its first frame.

An animation that repeats forever, such as `animation-iteration-count: infinite`, has no end. Stills hold it at its first frame, so every still of the beat agrees. The player moves on without waiting for it, and `dekc video` records it looping while the beat moves, then holds the first frame. Make the first frame the one you want in the handout.

`dekc shot --sheet` tiles every slide's still on one image, so the balance across the deck reads in one look.

## Seeing motion in stills

```bash
dekc shot timing --motion
```

This lays out the arrival of `timing` and each of its beats as a row, played the way the talk reaches it: the arrival from the slide before, each beat from the one it follows. Every row is held at 0, 25, 50, and 75% of everything that move starts (the view transition, the slide's CSS animations and transitions, and its script), then ended, so its last frame is the still `dekc shot` takes. A beat that moves nothing is that frame alone, captioned `no motion`. Only what the move started is held: an entrance that finished on an earlier beat stays finished, as it does in the talk.

The frames go on one image sized for an agent to read whole, and `--json` returns each frame's path and how many ms in it is, for a closer look. `--step` plays one beat alone, from the beat before it; `--step 0` plays the arrival.

## Next

Colors, type, and spacing in one file: [Themes](./theme).
