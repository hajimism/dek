---
layout: home
hero:
  name: dekc
  text: A build system for talks
  tagline: Write what you will say; dekc builds, measures, and ships the rest.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Why dekc
      link: /guide/why
    - theme: alt
      text: Samples
      link: /samples
    - theme: alt
      text: GitHub
      link: https://github.com/hajimism/dekc
features:
  - title: The script is the parent
    details: Order, timing, and every spoken word live in one Markdown file. Slides hang off its headings. Put the boxes first and you get a polished deck you cannot deliver.
  - title: One slide, one HTML file
    details: Each slide is a single &lt;section class="slide"&gt; fragment, about forty lines. Small enough to read in a diff, small enough for an agent to edit without breaking anything else.
  - title: Lint measures, you judge
    details: Allowed classes, self-containment, overflow, contrast. Conventions are rules, not prose. When lint passes, nothing measurable is wrong, and what is left is yours to judge.
  - title: One file on a USB stick
    details: dekc build folds the whole talk into a single HTML file. No server, no network. Reach for the dev server only when you want your phone as a remote.
---

```bash
bunx github:hajimism/dekc init my-talks --deck 2026-04-vite
cd my-talks && bun add -d github:hajimism/dekc
cd decks/2026-04-vite
$EDITOR script.md   # write what you will say
bunx dekc            # dev server: skeleton slides, live reload, lint on save
bunx dekc build      # dist/2026-04-vite.html — the whole talk in one file
```

Type `dekc`, not `dek`: the `dek` package on npm is unrelated. Until dekc is on npm, run `bunx dekc` inside the project.

You have not written a line of HTML yet, and you can already give the talk. Start with the [Getting Started](/guide/getting-started) guide, or read the [Tutorial](/guide/tutorial) to build a real deck from script to single-file build.
