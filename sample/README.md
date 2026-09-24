# dek sample

A twelve-minute deck about dek itself, built to double as a handout: every slide states its point in a full sentence and carries its own figure, so the PDF reads without the talk. Open `script.md` and you will find the order, the spoken words, and the timing all in one place. Every slide started as the skeleton `dek` generated from it. The project is set up the way a real talk project would be, with Playwright, rumdl, and voice included.

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

`dek` resolves to `file:..`, this repository itself. Playwright and rumdl are `devDependencies` of the sample.

The `[voice]` table in `dek.toml` is the default that `dek new` copies into new decks. The why-dek deck's actual settings live in `decks/why-dek/voice/`: `voice.toml`, and a `dict.toml` with readings for ASCII words. When the engine is down the dev server keeps running; only synthesis fails.

`voice.toml` also shows the timing knobs: `lead` for the whole deck, a longer lead into the annotated script on `anatomy`, and a longer pause after the last beat of `recap`.

The shared look comes from `decks/why-dek/theme.css`: a light, print-friendly theme where vermilion always means the script and indigo always means the screen. Each slide's figure, such as the tracks on `night-before`, the lanes on `beats`, and the rule table on `rules`, lives in that slide's own `slides/<id>.css`, so the theme keeps a small vocabulary. `slides/timing.ts` and `slides/one-file.ts` grow their charts as the slide enters, from numbers written into `data-*` attributes: the output of `dek ls` and the line counts of `slides/`. They draw from `t` alone, so the video, screenshots, and PDF show the same motion or its end state.

The images in `assets/` are screenshots taken with `dek shot`: `night-before` as the raw skeleton and as finished, and a slide that overflows, whose real `DEK030` diagnostic appears on `blind`.

## A second deck

`decks/say-it-first/` pitches dek in four minutes instead of explaining it: tension, the shift, a point of view, the reveal, proof, and a call to action. It shares nothing with why-dek but the project. Its own `theme.css` is a black stage with one electric violet, heavy display type, and pages that wipe in from the right; glows and grids live on pseudo-elements, so `lint --visual` measures only the words. Every entrance, from the typed heading on the cover to the counters and the dial, is drawn from `t` in `slides/<id>.ts`, so screenshots, the PDF, and video show the same motion or its end state. The dial on `clock` holds the deck's own `dek ls` estimates, and the build card on `moves` holds its real built size.
