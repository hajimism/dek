# dek

**A build system for talks.** Write what you will say; dek builds, measures, and ships the rest.

[Documentation](https://hajimism.github.io/dek/) · [日本語 README](./README.ja.md)

dek treats a talk the way a build system treats code. The source is your talk script, in Markdown; every `##` heading becomes one HTML slide, and from the same source dek estimates the timing, lints and measures every slide, and builds a single HTML file, a PDF, and a narrated video. A project holds many decks, so the theme and conventions carry forward from one talk to the next. It is designed from the start to be worked on together with AI agents.

> *dek* is *deck* with one letter dropped; the `deck` name belongs to Kong's decK.

## Why

**Slides exist so that you can talk.** Every mainstream tool starts with an empty box and asks you to fill it, and the deck grows more polished as the talk grows harder to deliver. dek starts from the other end: what you will say, in what order, for how long, and only then what should be on screen. The script is the parent. Slides are derived from it.

**A talk is not a one-off.** A dek project holds many decks. Conventions belong to the project, the look carries forward from your last deck, and every deck owns its script and slides.

**Agents need small files.** One slide is one HTML file of about forty lines, with an optional stylesheet and script beside it. The edit target is small, the diff is readable, and a broken edit breaks one slide.

**Agents cannot see what they render.** dek renders each slide and reports overflow, contrast, and missing images as machine-readable diagnostics, so an agent can check and fix its own output.

The three principles and the comparison with Slidev are in [Why dek](https://hajimism.github.io/dek/guide/why.html).

## Quick start

[Bun](https://bun.sh) 1.3 or later. dek is not on npm yet; it installs from GitHub.

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks
bun add -d github:hajimism/dek
cd decks/2026-04-vite
```

`init` prints these same steps as it finishes. You create the project once. Once dek is a dev dependency of the project, `bunx dek` runs it. Three commands remain, and for a live talk that is all there is.

> [!WARNING]
> `dek` on npm is an unrelated package. `bunx dek` runs this dek only inside a project that has it installed; anywhere else it downloads and runs that other package. This package is `@hajimism/dek`; once it is on npm, `bun add -d @hajimism/dek` replaces the GitHub install.

```bash
$EDITOR script.md   # 1. write what you will say — spend your time here
bunx dek            # 2. dev server: skeleton slides, live reload, lint on save
bunx dek build      # 3. dist/2026-04-vite.html — the whole talk in one file
```

Write the script, run `dek`, and you can present with the bundled theme without writing a line of HTML.

Continue with [Getting Started](https://hajimism.github.io/dek/guide/getting-started.html), or build a real deck end to end in the [Tutorial](https://hajimism.github.io/dek/guide/tutorial.html). Every command is listed in the [CLI reference](https://hajimism.github.io/dek/reference/cli.html).

## Sample

`sample/` is a full project with Playwright, rumdl, and voice, holding three decks about dek itself: `why-dek`, a twelve-minute explainer built to read as a handout; `lightning`, a three-minute lightning talk that builds a talk in a terminal; and `with-agents`, a six-minute talk about handing slides to an AI agent. See [sample/README.md](sample/README.md).

```bash
cd sample
bun install
bun run setup          # Chromium for Playwright
bun run dev            # or bun run lint:visual / bun run build
```

## Development

```bash
bun install
bunx playwright install chromium   # once, for the tests that drive a real browser
bun test --watch
bun run typecheck
bun run check             # Biome format + lint
bun run docs:dev          # VitePress
```

CI runs `biome ci`, `typecheck`, the full test suite (the browser tests in Chromium), and `docs:build`.

The documentation site deploys to GitHub Pages through Actions. Once, in the repository settings, set **Pages → Source** to **GitHub Actions**.

## License

MIT
