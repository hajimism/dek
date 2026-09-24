# Getting Started

This page takes you from nothing to a deck you can present. You will:

1. Install dek
2. Create a project and a first deck
3. Write a script and step through the generated slides in a browser
4. Export a single HTML file for the venue

You will not write HTML, and you will not touch voice or video. The goal is a presentable deck of skeleton slides in the bundled theme.

## Prerequisites

[Bun](https://bun.sh) 1.3 or later. dek is not published to npm; it runs straight from GitHub.

```bash
bunx github:hajimism/dek
```

To pin dek to a project, add it as a dependency inside that project. After that, `bunx dek` is enough.

```bash
bun add github:hajimism/dek
```

::: tip Why "dek"?
*dek* is *deck* with one letter dropped. The `deck` name on npm belongs to Kong's decK.
:::

## Create a project

Create the project somewhere outside the dek repository.

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks
bun add github:hajimism/dek
cd decks/2026-04-vite
```

You create a project once. The first deck comes with it. Pinning dek with `bun add` only fixes the CLI version; deck HTML never looks inside `node_modules`.

## What you have

```
my-talks/
├── package.json
├── dek.toml            # lint thresholds and speaking rate
├── .gitignore          # dist/, .cache/, .dek/server.json
├── .rumdl.toml         # Markdown rules for script.md
├── theme.css           # the starting point for every new deck
├── tsconfig.json       # editor types for slide scripts
├── assets/             # shared source material; decks copy what they use
├── decks/
│   └── 2026-04-vite/
│       ├── script.md   # the single source of truth
│       ├── theme.css   # this deck's own copy
│       ├── slides/     # one HTML file per slide
│       └── assets/
└── .dek/
    ├── schema.json     # frontmatter schema for your editor
    └── slide.d.ts      # the DekSlide type for slide scripts
```

There is always a `decks/` directory, even with a single deck. The `theme.css` at the project root is a template: `dek init` and `dek new` copy it into each new deck.

## Write the script

Open `script.md`. Each `##` heading becomes one slide.

```markdown
---
# yaml-language-server: $schema=../../.dek/schema.json
title: How I Built an HTML Slide Tool
event: Tokyo Frontend Meetup #42
date: 2026-04-18
duration: 20m
---

## intro

Hi. Today I want to talk about building my own slide tool.

> Keep the introduction short. Do not look at the clock.

## architecture

This is the one thing I want you to take home.

### The script is the parent {#script-parent}

First there is the script.

### Slides hang off it {#slides-hang}

The slides hang off it. Never the other way around.
```

The rules are few. A `##` heading is a slide. A `###` heading is a **beat**: a pause in the speaking, and a moment where the screen may advance. Paragraphs are what you say. A `>` blockquote is a stage direction; it is neither spoken nor counted toward timing.

## Start the dev server

From inside the deck:

```bash
bunx dek
```

The server generates a skeleton slide for every heading. The first section takes the deck title as its heading; `## architecture` becomes a slide with its beats listed one by one. Every save re-renders, re-syncs, and lints. Open the printed URL, press the right arrow, and watch the beats appear in order.

You never need to run `dek sync` or `dek lint` by hand while the server is up.

## Export for the venue

```bash
bunx dek build
```

This writes `decks/2026-04-vite/dist/2026-04-vite.html`. Open that one file in a browser and give the talk. Pass `--root-dist` to collect builds under the project's own `dist/` instead.

## Next

- Build a real deck from start to finish: [Tutorial](./tutorial)
- Learn the script rules in depth: [The Script](./script)
- Style a slide: [Slides](./slides)
- Hand the deck to an agent: [Working with AI Agents](./ai)
