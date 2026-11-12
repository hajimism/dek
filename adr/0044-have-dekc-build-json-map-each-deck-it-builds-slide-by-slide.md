# 44. Have dekc build --json map each deck it builds, slide by slide

Date: 2026-11-12

## Status

Accepted

## Context

dek.pub is to host a built deck beside a "script article", the talk's script laid out slide by slide, and to anchor review comments to a slide, a step of it, or a passage of its script. To do that it needs, for the file it hosts, which slides the file holds, the steps of each in the form the player and `dekc shot --step` name them, and the script each slide carries. `src/core/slide-map.ts` already makes that map from a resolved deck, in the shape `src/pub/protocol.ts` gives the server.

What `dekc build` printed with `--json` was the files it wrote, the preview images, and the findings. A tool that hosts the build, dek.pub's own `dekc pub` or anyone else's, would have to resolve the deck a second time to learn what the build put in each file, and could pair a map with the wrong reader: the script a `--public` build carries has no stage directions and no HTML comments, and the map has to say the same as the page.

## Decision

**`dekc build --json` gains `slideMaps`, one `SlideMap` per deck built, in the order of `outs`.** Each is `slideMap(deck, out, reader)`:

- `out` is the built file's path exactly as `outs` prints it, so the two pair by value as well as by position.
- `reader` is `audience` with `--public` and `speaker` without it, the same reader the build wrote the page for, so a map's `script` and `paragraphs` never hold more than the page it goes with.
- Each slide has `slug`, `title`, the heading's `line` in `script.md`, its `steps` as `dekc shot --step` takes them (`0` as the slide arrives, then each beat's `{#id}` or 1-based number, with its `title`), its `script` as Markdown, and the `paragraphs` said aloud as plain text.

The contract in `src/cli/contract.ts` takes the zod shape from `src/pub/protocol.ts` itself rather than a copy, so the field the CLI prints and the field the server reads cannot drift. Text output is unchanged.

**What was not chosen:**

- **A separate command, such as `dekc map`.** It would resolve the deck again and could be run with another `--public` than the build, which is the mismatch this field exists to rule out.
- **Writing the map into the built HTML.** The page is what readers download; a map inside it would grow every build for the sake of one host, and a host reading it back would have to parse the page.
- **An optional field, present only on request.** The map is cheap next to the build and has no flag that changes it besides `--public`, which the build already takes; a field that is always there is one less case for a reader.

## Consequences

- `dekc pub` and any other host read what a build holds from the build's own output, with the reader settled by the same flag.
- `--json` for build grows by the size of each deck's script. Nothing it printed before is taken away or loosened, so `bun scripts/schema-compat.ts` reports the change as additive.
- A change to `SlideMap` in `src/pub/protocol.ts` is now also a change to `dekc build --json`, and goes through `bun run schema` and the breaking-change check of ADR 31 like any other.
