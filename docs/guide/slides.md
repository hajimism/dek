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

- **One root.** The file is a `<section class="slide">` fragment. A file with none draws nothing (`DEK007`), and a second one is dropped (`DEK009`). Its id comes from the file name; `dek build` injects `data-slug` for you. If you write `data-slug` yourself it must match the section id (`DEK006`).
- **Write HTML your way.** Close tags or leave them open, quote attributes or do not. Anything that is valid HTML5 is accepted, and a full document with `<html>` and `<body>` around the section works too. Minification happens once, at build time.
- **Pick a layout with `data-layout`.** The bundled theme ships `title`, `default`, `two-col`, `full-bleed`, and `quote`; a layout that neither the theme nor the slide's own stylesheet defines is `DEK019`. `default` is top-aligned, so the heading stays put as beats add elements below it; that matters when the deck becomes a video.
- **The canvas is 1280 × 720.** A `4:3` deck is 1024 × 768. The player scales the whole slide with `transform: scale()` to fit the viewport.
- **Only theme classes, or the slide's own.** A class that neither the theme nor the slide's `slides/<id>.css` defines is `DEK010`. Inline `<style>`, `style=` attributes, `<script>`, event handlers such as `onclick=`, and `javascript:` URLs are `DEK011`.
- **Change appearance through tokens.** Colors, type, spacing, and motion come from `var(--*)`, in the theme or in the slide's own stylesheet. Never write raw values.
- **Scripts sit beside the slide, not inside it.** Motion that CSS cannot express goes in `slides/<id>.ts`; see [Scripted motion](./steps#scripted-motion).
- **Stay inside the deck.** Reference images as `assets/name.png`, never through `../`. Remote URLs are `DEK020`, a missing file is `DEK021`, a path that leaves the deck directory is `DEK022`, and a local file that does not start with `assets/` is `DEK023`. `srcset`, `poster`, and `<video>`, `<audio>`, `<source>`, `<track>`, and `<iframe>` sources are checked the same way as `<img src>`.

The document shell, the `lang` attribute from the script's frontmatter, and the player are added by the renderer. Check your work with the dev server or with one command:

```bash
dek check architecture --shot
```

## Skeletons

`dek sync`, and the dev server on every save, generates a skeleton for any section that has no HTML. The skeleton is not an empty file. It puts the heading text in an `<h2>` and lists the beats with `data-step` already bound.

```html
<section class="slide" data-layout="default">
  <h2 class="slide-title"></h2>
  <ul>
    <li data-step="script-parent">The script is the parent</li>
    <li data-step="slides-hang">Slides hang off it</li>
    <li data-step="3">A beat with no id</li>
  </ul>
</section>
```

A section without beats gets `data-layout="title"`; with beats, `default`. Beats with an id are bound by id; beats without one are bound by their 1-based position.

A heading that is only an id, such as `## recap`, has no display text, so its skeleton `<h2>` is empty. The first section is the exception: it takes the deck `title`. This keeps an English slug from ending up on a projected slide by accident. Lint warns about the empty heading as `DEK024`. If you want words there, write `## Recap {#recap}`.

Sync never touches a slide you have edited. Adding a beat to the script does not update HTML you already wrote; the binding is the job of `data-step`. Because the skeleton uses beat ids, giving beats `{#id}` names before you start hand-writing HTML means later insertions never break a slide. A number you write by hand for a beat that has an id is `DEK025`, a warning whose hint names the id.

A skeleton nobody has edited yet is different: it is still sync's output, so sync rewrites it when the script moves on. Change the deck `title` or add a beat, and the untouched skeleton follows; the first edit you make to the file ends that. `dek sync` lists such files as `(updated)`.

## Slide stylesheets

Decoration that only one slide uses does not belong in the shared vocabulary. Put it in `slides/<id>.css`, next to the HTML.

```css
/* slides/usb.css */
.usb-mark { color: var(--accent); }
.slide.is-current .usb-mark { animation: pop var(--step-transition); }
@keyframes pop { from { transform: scale(0.9); } }
```

The renderer scopes every rule to that slide. `.usb-mark` becomes `.slide:where([data-slug="usb"]) .usb-mark`, a leading `.slide` becomes `.slide:where([data-slug="usb"])`, and `pop` is renamed so that another slide's `pop` does not collide with it. The scope weighs exactly one `.slide`, so a rule here behaves as if it were written at the end of `theme.css`: it beats the theme's `.slide .x`, and the theme's more specific rules, such as a layout's `.slide[data-layout="split"] .x` or the beat state `.slide.is-current [data-step]`, still beat it. To override one of those, write the same selector here.

The theme's rules still apply. Values come from tokens (`DEK014`), and you may define new tokens of your own. A class defined here counts as defined for this slide only (`DEK010`) and does not count toward `max_classes` (`DEK013`). Rules that reach past the slide stay in `theme.css` (`DEK012`): `::view-transition-*`, `@font-face`, `@import`, and `:root`, `html`, or `body`, which never match inside a slide. `url()` follows the slide HTML's asset rules: `assets/...`, relative to the deck, and nothing remote (`DEK020`, `DEK023`). `dek mv` moves the stylesheet along with the HTML, and a stylesheet with no section is `DEK002`. Once a class shows up on several slides, move it into `theme.css`.

## Density is the theme's job

How much fits on a slide is decided by font sizes and spacing in `theme.css`, not by a rule about word counts. Set the type large, and a crowded slide overflows the canvas the moment you cram it. `dek lint --visual` measures the overflow and reports it as `DEK030`, a verdict that comes from geometry rather than opinion. If you want denser slides, make the type smaller in the theme. That decision then lives in a diff where it can be reviewed.

## Next

Reveal elements in step with your speaking, and carry an element across slides: [Beats](./steps).
