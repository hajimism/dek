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

## Next

Colors, type, and spacing in one file: [Themes](./theme).
