# dek sample

Three decks about dek itself. `why-dek` is a twelve-minute talk built to double as a handout: every slide states its point in a full sentence and carries its own figure, so the PDF reads without the talk. `lightning` is a three-minute lightning talk that builds a talk in a terminal, and `with-agents` a six-minute talk about handing slides to an AI agent. Open any `script.md` and you will find the order, the spoken words, and the timing all in one place. Every slide started as the skeleton `dek` generated from it. The project is set up the way a real talk project would be, with Playwright, rumdl, and voice included.

[日本語](./README.ja.md)

## Setup

After cloning the repository:

```bash
cd sample
bun install
bun run setup          # Chromium for Playwright
```

Two system dependencies are optional. When one is missing, only the command that needs it fails, with the install step in its hint. The rest of the CLI runs.

- Muxing video: [ffmpeg](https://ffmpeg.org/) (`brew install ffmpeg`)
- `voice`, `rehearse`, `video`: a [VOICEVOX](https://voicevox.hiroshiba.jp/)-compatible engine listening on `127.0.0.1:50021`

## Day to day

```bash
bun run dev            # dev server: render and lint on every save
bun run lint:visual    # overflow and contrast (Playwright)
bun run build          # decks/<deck>/dist/<deck>.html for each deck
```

The scripts do not pin a deck. From the project root they apply to every deck; from inside a deck, to that deck. To target one deck from the root, pass its name: `bun run build -- why-dek`, or `cd decks/why-dek`. `shot`, `cues`, `voice`, `rehearse`, and `video` need a single deck, so from the root pass `-- why-dek`.

| Script | Command |
| --- | --- |
| `bun run lint` | `dek lint` |
| `bun run shot` | Screenshots |
| `bun run pdf` | PDF |
| `bun run cues` | Spoken cues as `Cue[]`, no engine needed |
| `bun run voice` | Synthesize changed sentences (VOICEVOX) |
| `bun run rehearse` | Auto-advance from the Timeline |
| `bun run video` | `decks/<deck>/dist/<deck>.mp4` (Playwright + ffmpeg + voice) |

## Layout

dek is installed as `@hajimism/dek` from `file:..`, this repository itself, next to Playwright and rumdl in the sample's `devDependencies`. A project of your own installs it with `bun add -d github:hajimism/dek` instead.

The `[voice]` table in `dek.toml` is the default that `dek new` copies into new decks. Each deck's actual settings live in its own `voice/`: `voice.toml`, and a `dict.toml` with readings for ASCII words. When the engine is down the dev server keeps running; only synthesis fails.

`decks/why-dek/voice/voice.toml` also shows the timing knobs: `lead` for the whole deck, a longer lead into the annotated script on `script`, and a longer pause after the last beat of `recap`.

The three decks share nothing but the project. Each has its own `theme.css`, and decoration that only one slide uses lives in that slide's `slides/<id>.css`, so every theme keeps a small vocabulary. Motion that CSS cannot express is drawn from `t` alone in `slides/<id>.ts`, so the video, screenshots, and PDF show the same motion or its end state. Whatever looks like a measurement or a command's output is real: it was measured or run, and a caption on the slide says where it came from. Those numbers go stale when a script or a slide changes, so refresh them with the deck.

## why-dek

`decks/why-dek/` is a twelve-minute explainer built to double as a handout. Every slide states its point as a full-sentence heading and carries its own figure, so the PDF reads without the talk. It runs from what today's slide making leaves for later, through the script, skeletons, small files, beats, and motion, to measuring, lint, agents, refs, and the single file you take to the venue.

Its theme is Swiss editorial on print-friendly paper: near-black ink, one cobalt signal color, a yellow highlighter for emphasis, a visible twelve-column grid, and a running head with the page number. The three problem cards on `later` carry into `order` with `data-morph`, and `script.md` in the tree on `deck` carries into `script`. `timing` charts the deck's own `dek ls` estimate against its budget from `data-*` attributes, `files` holds the line counts of its own `slides/`, `lint` lays out all 31 rules in five layers, `measure` shows a real `DEK030` and `DEK031`, and `outputs` the built file's real size. `skeleton` shows `dek shot` of the raw skeleton of `later` next to the finished slide, from `assets/`.

## lightning

`decks/lightning/` is a three-minute lightning talk that builds a talk in a terminal as it goes: init, write the script, save, check the length, style, measure, build. Its theme is an amber CRT: warm black, phosphor type, and scanlines, vignette, and bloom drawn on pseudo-elements, so `lint --visual` measures only the words. Commands type themselves from `t`, the terminal window carries from slide to slide with `data-morph`, and a clock in the footer grows toward 3:00 from the deck's own `dek ls` estimates. Every command's output is a real run of dek in a throwaway project; `write` shows this deck's own `script.md`, and `elapsed` its own section estimates.

## with-agents

`decks/with-agents/` is a six-minute talk for developers who hand slides to an AI coding agent: why agents stumble on slides, and the three promises that let them run the loop alone (measured verdicts, small files, lint as the finish line). Its theme looks like a product page: a light gray canvas, white cards and windows with soft shadows, pastel status pills, dark syntax-colored panels, and chat bubbles between you and the agent. The problem cards on `why` morph into the promise cards on `answer`, and the dot on the ring in `loop` advances with each beat. Every JSON panel and terminal is real output from a throwaway project: a `DEK030` from `dek check --shot`, an error envelope with its hint, a `skipped` entry, `dek show`, and a real `dek ref hajimism/dek/why-dek` pin with a shot of the ref's `timing` slide.
