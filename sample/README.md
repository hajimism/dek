# dek sample

An eight-minute deck about dek itself. Open `script.md` and you will find the order, the spoken words, and the timing all in one place. The project is set up the way a real talk project would be, with Playwright, rumdl, and voice included.

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

`voice.toml` also shows the timing knobs: `lead` for the whole deck, a longer lead into the full-bleed `usb` slide, and a longer pause after the last beat of `recap`.

Most of the look comes from `decks/why-dek/theme.css`. Decoration that only one slide uses sits beside that slide instead: `slides/intro.css` flips the hero mark, and `slides/files.css` styles the big number. `slides/files.ts` makes that number count up to 40 as the slide enters. It draws from `t` alone, so the video, screenshots, and PDF show the same motion or its end state.
