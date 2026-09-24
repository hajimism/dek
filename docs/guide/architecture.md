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

The CLI works on files directly. Only the two commands that need to know or change what a browser is showing, `goto` and `current`, talk to a running dev server over HTTP, and they fail with a hint when none is running.

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

Playwright runs in a separate worker process, resolved from `node_modules` at run time, because Bun's Node compatibility is partial. `DEK_PLAYWRIGHT` can point at an alternative worker, which is also how the tests run without a browser. rumdl is found on `PATH`, in `node_modules/.bin`, or at `DEK_RUMDL`.

## Where agents plug in

At the CLI. Every result command takes `--json`, diagnostics are SARIF, and `dek help --agent` is the compact reference. See [Working with AI Agents](./ai) and the [CLI reference](/reference/cli).
