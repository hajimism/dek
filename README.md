# dek

**Talk-script-first HTML slides.** Write what you will say. The slides follow.

[Documentation](https://hajimism.github.io/dek/) · [日本語 README](./README.ja.md)

dek is a CLI that builds a slide deck from your talk script. You write the script in Markdown, and every `##` heading becomes one HTML slide. A project holds many decks, so the theme and conventions carry forward from one talk to the next. It is designed from the start to be worked on together with AI agents.

> *dek* is *deck* with one letter dropped; the `deck` name belongs to Kong's decK.

## Why

**Slides exist so that you can talk.** Every mainstream tool starts with an empty box and asks you to fill it, and the deck grows more polished as the talk grows harder to deliver. dek starts from the other end: what you will say, in what order, for how long, and only then what should be on screen. The script is the parent. Slides are derived from it.

**A talk is not a one-off.** A dek project holds many decks. Conventions belong to the project, the look carries forward from your last deck, and every deck owns its script and slides.

**Agents need small files.** One slide is one HTML file of about forty lines. The edit target is small, the diff is readable, and a broken edit breaks one slide.

**Agents cannot see what they render.** dek renders each slide and reports overflow, contrast, and missing images as machine-readable diagnostics, so an agent can check and fix its own output.

The three principles and the comparison with Slidev are in [Why dek](https://hajimism.github.io/dek/guide/why.html).

## Quick start

[Bun](https://bun.sh) 1.3 or later. dek is not on npm; it runs from GitHub.

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks
bun add github:hajimism/dek
cd decks/2026-04-vite
```

You create the project once. After `bun add`, `bunx dek` is enough. Three commands remain, and for a live talk that is all there is.

```bash
$EDITOR script.md   # 1. write what you will say — spend your time here
bunx dek            # 2. dev server: skeleton slides, live reload, lint on save
bunx dek build      # 3. dist/2026-04-vite.html — the whole talk in one file
```

Write the script, run `dek`, and you can present with the bundled theme without writing a line of HTML.

Continue with [Getting Started](https://hajimism.github.io/dek/guide/getting-started.html), or build a real deck end to end in the [Tutorial](https://hajimism.github.io/dek/guide/tutorial.html). Every command is listed in the [CLI reference](https://hajimism.github.io/dek/reference/cli.html).

## Sample

`sample/` is an eight-minute deck about dek itself, set up as a full project with Playwright, rumdl, and voice. See [sample/README.md](sample/README.md).

```bash
cd sample
bun install
bun run setup          # Chromium for Playwright
bun run dev            # or bun run lint:visual / bun run build
```

## Development

```bash
bun install
bun test --watch
bun run typecheck
bun run check             # Biome format + lint
bun run docs:dev          # VitePress
```

CI runs `biome ci`, `typecheck`, the full test suite, and `docs:build`.

The documentation site deploys to GitHub Pages through Actions. Once, in the repository settings, set **Pages → Source** to **GitHub Actions**.

## License

MIT
