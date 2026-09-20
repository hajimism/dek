# Slides

A slide is one file in `slides/`, named after its section id, with a single root element: `<section class="slide">`. You style it with the classes your theme defines and nothing else.

```html
<section class="slide" data-layout="two-col">
  <h2 class="slide-title">The script is the parent</h2>
  <div class="col">
    <p class="node">script.md</p>
    <p class="node node-parent" data-step="script-parent">script.md ← parent</p>
  </div>
  <div class="col" data-step="slides-hang">
    <p class="node">intro.html</p>
    <p class="node">architecture.html</p>
  </div>
</section>
```

## The rules

- **One root.** The file is a `<section class="slide">` fragment. Its id comes from the file name; `dek build` injects `data-slug` for you. If you write `data-slug` yourself it must match the section id (`DEK006`).
- **Write HTML your way.** Close tags or leave them open, quote attributes or do not. Anything that is valid HTML5 is accepted, and a full document with `<html>` and `<body>` around the section works too. Minification happens once, at build time.
- **Pick a layout with `data-layout`.** The bundled theme ships `title`, `default`, `two-col`, `full-bleed`, and `quote`. `default` is top-aligned, so the heading stays put as beats add elements below it; that matters when the deck becomes a video.
- **The canvas is 1280 × 720.** A `4:3` deck is 1024 × 768. The player scales the whole slide with `transform: scale()` to fit the viewport.
- **Only theme classes.** A class the theme does not define is `DEK010`. Inline `<style>`, `style=` attributes, and `<script>` are `DEK011`.
- **Change appearance through tokens.** Colors, type, spacing, and motion come from `var(--*)` in the theme, never from the slide.
- **No JavaScript.** Motion and interaction belong to the runtime and to `theme.css`.
- **Stay inside the deck.** Reference images as `assets/name.png`, never through `../`. Remote URLs are `DEK020`, a missing file is `DEK021`, a path that leaves the deck directory is `DEK022`, and a local `src` that does not start with `assets/` is `DEK023`.

The document shell, the `lang` attribute from the script's frontmatter, and the player are added by the renderer. Check your work with the dev server or with one command:

```bash
dek check architecture --shot
```

## Skeletons

`dek sync`, and the dev server on every save, generates a skeleton for any section that has no HTML. The skeleton is not an empty file. It puts the heading text in an `<h2>` and lists the beats with `data-step` already bound.

```html
<section class="slide" data-layout="default">
  <h2 class="slide-title">architecture</h2>
  <ul>
    <li data-step="script-parent">The script is the parent</li>
    <li data-step="slides-hang">Slides hang off it</li>
    <li data-step="3">A beat with no id</li>
  </ul>
</section>
```

A section without beats gets `data-layout="title"`; with beats, `default`. Beats with an id are bound by id; beats without one are bound by their 1-based position.

A heading that is only an id, such as `## recap`, has no display text, so its skeleton `<h2>` is empty. The first section is the exception: it takes the deck `title`. This keeps an English slug from ending up on a projected slide by accident. If you want words there, write `## Recap {#recap}`.

Sync never touches an existing file. Adding a beat to the script does not update HTML you already wrote; the binding is the job of `data-step`. Because the skeleton uses beat ids, giving beats `{#id}` names before you start hand-writing HTML means later insertions never break a slide.

## Density is the theme's job

How much fits on a slide is decided by font sizes and spacing in `theme.css`, not by a rule about word counts. Set the type large, and a crowded slide overflows the canvas the moment you cram it. `dek lint --visual` measures the overflow and reports it as `DEK030`, a verdict that comes from geometry rather than opinion. If you want denser slides, make the type smaller in the theme. That decision then lives in a diff where it can be reviewed.

## Next

Reveal elements in step with your speaking, and carry an element across slides: [Beats](./steps).
