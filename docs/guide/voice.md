# Voice and Video

Voice is opt-in. A deck with a `voice/` directory can synthesize its script with a local text-to-speech engine, rehearse to that audio, and bake an MP4. A deck without `voice/` is unaffected, and its definition of done does not change.

Voice and video are derived from the script. The script knows nothing about either.

```
script.md → Deck → Cue → Synth → Timeline → schedule
                                      ├→ rehearse  (the browser drives itself)
                                      └→ video     (frames → ffmpeg)
```

## Only paragraphs are spoken

```bash
dek cues
```

This prints the spoken cues for every beat and needs no engine. Blockquotes, lists, code, and tables are dropped; inline emphasis, links, and code spans are flattened to text. A beat with visible content but no paragraph is reported as `DEK042` alongside the cues, so you notice it while you are still writing.

## Setup

Add a `[voice]` table to `dek.toml`, and `dek new` copies it into each new deck as `voice/voice.toml`. For an existing deck, write the file yourself.

```toml
# decks/<deck>/voice/voice.toml
engine  = "voicevox"
speaker = "ずんだもん/ノーマル"
speed   = 1
pause   = { sentence = 350, beat = 700 }
```

`voice`, `rehearse`, and `video` need a running VOICEVOX-compatible engine. If none is found, only that command fails, and the hint tells you how to install one.

- **VOICEVOX** at port 50021: [voicevox.hiroshiba.jp](https://voicevox.hiroshiba.jp/), or `docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest`
- **AivisSpeech** at port 10101 with `engine = "aivis"`: [aivis-project.com](https://aivis-project.com/), or `docker run --rm -p 127.0.0.1:10101:10101 ghcr.io/aivis-project/aivisspeech-engine:cpu-latest`
- COEIROINK and SHAREVOX are recognized by name.
- Any compatible engine elsewhere: set `engine` to its URL, or export `DEK_VOICE_URL`.

## Synthesis

```bash
dek voice
dek voice speakers
dek voice say "Hello"
dek voice dict add dek デック
dek voice pin
```

`dek voice` synthesizes only the sentences that changed and writes the audio, the per-sentence cache, and `timeline.json` under `.cache/voice/`. The dev server does the same on save. An ASCII word missing from `voice/dict.toml` is `DEK040`, a warning; add readings with `dict add`. `dek voice pin` copies the master audio and Timeline into `voice/pin/`, a portable snapshot that survives a cleared cache.

Kana and durations are machine-readable. dek does not default to a cloud TTS.

## Rehearsal

```bash
dek rehearse
```

The dev server starts with the Timeline as its clock and the browser advances beats on time with the audio. Nothing is recorded. `Space` plays and pauses; the arrow keys and `dek goto` seek, and the audio follows. A hand-written `timeline.json` is enough to rehearse without an engine.

## Video

```bash
dek video
dek video architecture
dek video --fps 30 --root-dist
```

A whole deck becomes `dist/<deck>.mp4`, or `<root>/dist/<deck>.mp4` with `--root-dist`. A single slide goes to `.cache/video/<slug>.mp4`. Requires Playwright, ffmpeg, and a Timeline; without a Timeline the hint says to run `dek voice` first. Alongside the MP4, dek writes `.vtt` captions, a `.chapters.txt` chapter list, and a `.credits.txt` file naming the speaker. Credits are not burned into the picture.

Baking does not replay the talk in real time. Each beat is one held frame plus whatever the transition needs.

When a Timeline exists, `dek ls` shows the narrated length next to the word-count estimate, and a large gap from the `duration` budget is `DEK041`, a warning. There is no notation for silent time: a beat with no paragraph passes through the transition and `pause.beat`, and nothing else.

## The daily four

```bash
$EDITOR script.md
dek
dek rehearse
dek video
```

For a live-only talk, the three commands in [Getting Started](./getting-started) are all there is.

## Next

Let an agent write, check, and fix slides: [Working with AI Agents](./ai).
