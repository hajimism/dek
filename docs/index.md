---
layout: home
hero:
  name: dek
  text: A build system for talks
  tagline: Write what you will say; dek builds, measures, and ships the rest.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Why dek
      link: /guide/why
    - theme: alt
      text: Samples
      link: /samples
    - theme: alt
      text: GitHub
      link: https://github.com/hajimism/dek
features:
  - title: The script is the parent
    details: Order, timing, and every spoken word live in one Markdown file. Slides hang off its headings. Put the boxes first and you get a polished deck you cannot deliver.
  - title: One slide, one HTML file
    details: Each slide is a single &lt;section class="slide"&gt; fragment, about forty lines. Small enough to read in a diff, small enough for an agent to edit without breaking anything else.
  - title: Lint is the definition of done
    details: Allowed classes, self-containment, overflow, contrast. Conventions are rules, not prose. When lint passes, the deck is finished.
  - title: One file on a USB stick
    details: dek build folds the whole talk into a single HTML file. No server, no network. Reach for the dev server only when you want your phone as a remote.
---

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks && bun add -d github:hajimism/dek
cd decks/2026-04-vite
$EDITOR script.md   # write what you will say
bunx dek            # dev server: skeleton slides, live reload, lint on save
bunx dek build      # dist/2026-04-vite.html — the whole talk in one file
```

Run `bunx dek` inside the project: the `dek` package on npm is unrelated, and `bunx dek` runs it anywhere dek is not installed.

You have not written a line of HTML yet, and you can already give the talk. Start with the [Getting Started](/guide/getting-started) guide, or read the [Tutorial](/guide/tutorial) to build a real deck from script to single-file build.
