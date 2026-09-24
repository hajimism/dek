# Beats

A beat is a `###` heading in the script. On screen, a beat is the moment an element appears. This page covers the HTML side of that link, the transition between slides, and how to carry an element from one slide to the next. The order always comes from the script; the appearance always comes from CSS.

## `data-step`

`data-step` names the beat an element belongs to. Its value is a beat id, or a positive integer meaning "the k-th beat of this slide". The runtime does one thing: when you reach a beat, it adds `is-shown` to every element bound to that beat or an earlier one. The theme decides what shown and hidden look like.

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

Fade, slide in, or anything else CSS can express: the choice belongs to whoever writes the theme. dek adds no vocabulary of its own.

The bundled theme hides elements with `opacity` and `transform` rather than `display: none`, so the layout is identical at every beat. That is what lets `lint --visual` give the same overflow verdict no matter which beat it measures.

A beat with no bound element is fine; it is a pause in the speaking. Numbers need not be consecutive. The only error is a `data-step` that resolves to nothing, reported as [DEK003](/reference/lint#dek003).

## View Transitions

Moving between slides uses the browser's View Transitions API. The runtime calls `document.startViewTransition()`; the theme writes the animation.

```css
/* theme.css */
::view-transition-old(root) { animation: fade-out var(--step-transition); }
::view-transition-new(root) { animation: fade-in var(--step-transition); }
```

## `data-morph`

To carry an element into the next slide, give it the same `data-morph` name on both slides.

```html
<!-- problem.html -->
<img class="figure" data-morph="pipeline" src="assets/pipeline.svg">

<!-- architecture.html -->
<img class="figure figure-small" data-morph="pipeline" src="assets/pipeline.svg">
```

The runtime turns `data-morph` into a `view-transition-name`, and the browser interpolates position and size between the two slides. A figure that shrinks into the corner as the next topic begins is one attribute, and both slides remain plain `<section class="slide">` fragments.

Two elements with the same `data-morph` on one slide is [DEK005](/reference/lint#dek005).

A morph is invisible in a still image. To judge one, freeze the transition part-way and look:

```bash
dek shot problem --to architecture --at 0.5
```

This writes one frame of the transition from the last beat of `problem` into `architecture`, stopped at 50%, to `.cache/shots/problem-to-architecture-0.5.<hash>.png`. Use `--at 0` and `--at 1` for the endpoints. The frame comes from the same player document that `dek video` records, so what you see is what the video shows.

The bundled theme honors `prefers-reduced-motion` and drops every animation when it is set.

## Scripted motion

When CSS cannot express a motion, such as a counter that runs, a chart that draws itself, or a canvas, put a script next to the slide as `slides/<id>.ts`. Plain JavaScript is valid TypeScript, so a script without types works as it is.

```ts
// slides/growth.ts
export default {
  motion: { growth: 1200 },            // ms of motion, keyed like data-step
  draw(slide, { index, step, t }) {    // t: ms since this beat began
    const p = step === "growth" ? t / 1200 : 0;
    const bar = slide.querySelector<HTMLElement>("[data-bar]");
    if (bar) bar.style.width = `${p * 80}%`;
  },
} satisfies DekSlide;
```

Find elements with a `data-*` attribute, such as `<div data-bar>`, rather than a class. A class exists to be styled, so one used only as a hook is `DEK010` until a stylesheet defines it, and a class in a `querySelector` or `closest` is `DEK017`.

`DekSlide` needs no import. `dek init` and `dek sync` write its definition to `.dek/slide.d.ts`, and `dek init` also writes a `tsconfig.json` that points your editor at it, so `slide` is an `HTMLElement`, `t` is a number, and a misspelled field or a Node global such as `process` is flagged as you type. `dek sync` never creates or edits `tsconfig.json`; if your project has its own, add `".dek/*.d.ts"` to its `include`. dek erases the types when it builds and does not run `tsc`; lint checks what matters at run time.

`draw` is a function of time, and the runtime owns the clock:

- A forward step runs `t` from 0 to the beat's `motion` on animation frames.
- A jump, a step back, `prefers-reduced-motion`, the rail, the presenter's next preview, `dek shot`, `lint --visual`, and the PDF all draw once, at the end.
- `dek video` seeks `t` frame by frame alongside the Web Animations, then holds the last frame for the rest of the beat.
- A beat without a `motion` entry is drawn once, at `t = 0`.

So draw from `t` alone, and set everything you touch on every call: the same `(index, t)` must give the same slide whatever was drawn before, because a jump or a step back draws only the end of the new beat. Timers, `requestAnimationFrame`, and state carried between calls break the video, because the recorder does not wait in real time. Lint reports a timer, `Date`, `performance.now`, or `Math.random` as `DEK017`, on its line. The script must be self-contained: one module with `export default` and no imports, whose top level only defines things; touch the slide inside `draw`. Anything else is `DEK016`, and so is a `motion` key that is not a beat of the slide. Lint evaluates the top level in a sandbox with no Node or Bun globals and stops it after a second. dek loads only `.ts`; a `slides/<id>.js` is `DEK016`, asking you to rename it. `dek build` inlines the script, `dek mv` moves it, and saving it reloads the dev server page.

## Next

Colors, type, and spacing in one file: [Themes](./theme).
