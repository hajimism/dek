---
description: 'Core shared by the CLI and the dev server. Optional dependencies.'
---

# Architecture

The design decision that matters most is that **core** is a standalone module. The CLI and the dev server share one parser, one rule set, and one project resolver. Two parsers would drift.

```
                 ┌─────────────────┐
                 │   core (parser) │   project → Deck[]
                 │   + rules       │   Deck + slides/ → Diagnostic[]
                 └────────┬────────┘
                  ┌───────┴───────┐
                  │               │
             ┌────┴────┐    ┌─────┴─────┐
             │   CLI   │    │ dev server│
             └────┬────┘    └─────┬─────┘
                  └──── HTTP ─────┘   goto / current
```

The CLI works on files directly. Only the two commands that need to know or change what a browser is showing, `goto` and `current`, talk to a running dev server over HTTP, and they fail with a hint when none is running. The only command that reaches the network is `dekc ref`, which fetches a pinned commit from GitHub; `ls`, `show`, `theme`, and `shot` fetch it again when a ref's snapshot is missing. Lint, build, and sync never do.

## Voice and video

Voice and video sit on the same core as separate drivers. Core knows about Cues, Timelines, and schedules; the speech engine, ffmpeg, and the browser are adapters.

```
script.md → Deck → Cue → Synth → Timeline → schedule
                                      ├→ RehearseDriver → player.go()
                                      └→ VideoDriver    → player.go() + frames → mux
```

Video capture does not replay the talk at wall-clock speed. The worker starts each `go`, pauses the Web Animations, and screenshots at `currentTime` stops from `frameStops`. One hold frame covers the rest of the beat, so rendering time follows the amount of motion rather than the length of the talk. Slide scripts share that clock: in video mode the player holds each script at `t = 0`, and the worker seeks it at the same stops through `window.dekMotion`.

## Optional dependencies

Playwright, ffmpeg, and the speech engine are optional. When one is missing, only the command that needs it fails, and its hint says what to install. The CLI itself always starts.

Playwright runs in a separate worker process, resolved from `node_modules` at run time, because Bun's Node compatibility is partial. `DEK_PLAYWRIGHT` can point at an alternative worker, which is also how the tests run without a browser. rumdl is found on `PATH`, in the `node_modules/.bin` beside dek's install, or at `DEK_RUMDL`. Neither is looked up from the current directory, which a cloned repository controls.

## A project you did not write

dek builds a project, but the project does not configure the Bun that runs dek. The `dekc` bin runs Bun with `--no-env-file --config=/dev/null`, and every bun dek starts gets the same flags, so a `.env` or a `bunfig.toml` in the working directory sets no variable and preloads no code. The package ships its own `tsconfig.json`, so a project's `paths` cannot redirect dek's imports. `dekc ref` sends a token only to `api.github.com`, and only one set in `GITHUB_TOKEN` or `GH_TOKEN`; dek never asks `gh` for one.

How dek is started is outside what it can check. `bun ./node_modules/.bin/dekc` skips the bin's flags, so Bun reads the project's `bunfig.toml` before dek starts; dek still ignores the `DEK_` variables a `.env` sets. A project's `package.json` scripts and anything it commits under `node_modules` are the project's own code. Before running dekc in a project you did not write, check that the `dekc` you run is one you installed. [SECURITY.md](https://github.com/hajimism/dek/blob/main/SECURITY.md) says which reports are in scope.

## Where agents plug in

At the CLI. Every result command takes `--json`, diagnostics are SARIF, and `dekc help --agent` is the compact reference. See [Working with AI Agents](./ai) and the [CLI reference](/reference/cli).
