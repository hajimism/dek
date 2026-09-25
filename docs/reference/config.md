# Configuration

There are three places to configure dek: the project's `dek.toml`, the frontmatter of each deck's `script.md`, and the optional `voice/` files inside a deck.

## Directory layout

```
my-talks/
├── dek.toml
├── .gitignore
├── .rumdl.toml
├── theme.css
├── tsconfig.json
├── AGENTS.md
├── assets/
├── refs/                          # gitignored; fetched again from [refs]
│   └── owner/repo/deck/
├── decks/
│   └── 2026-04-vite/
│       ├── script.md
│       ├── theme.css
│       ├── voice/                 # optional
│       │   ├── voice.toml
│       │   ├── dict.toml
│       │   └── pin/
│       ├── slides/
│       ├── assets/
│       ├── dist/
│       │   ├── 2026-04-vite.html
│       │   ├── 2026-04-vite.png
│       │   ├── 2026-04-vite.pdf
│       │   ├── 2026-04-vite.mp4
│       │   ├── 2026-04-vite.vtt
│       │   ├── 2026-04-vite.chapters.txt
│       │   └── 2026-04-vite.credits.txt
│       └── .cache/
│           ├── voice/
│           ├── video/
│           └── shots/
└── .dek/
    ├── schema.json
    ├── slide.d.ts
    └── server.json                # while the dev server runs
```

The boundary between project and deck is explained in [Projects and Decks](/guide/structure).

## `dek.toml`

```toml
# dek project
url = "https://example.com/talks/"
max_classes = 40
cjk_per_minute = 300
latin_per_minute = 130

[voice]
engine = "voicevox"
speaker = "ずんだもん/ノーマル"
speed = 1.0

[refs]
"hajimism/dek/why-dek" = "89fbd5a0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6"
```

| Key | Default | Purpose |
| --- | --- | --- |
| `url` | none | The absolute http(s) URL `dist/` is served from. With it, `dek build` writes `og:url` and a first-slide `og:image`; `--url` overrides it. See [On the web](/guide/present#on-the-web) |
| `max_classes` | `40` | Upper bound for `DEK013` |
| `cjk_per_minute` | `300` | Speaking rate for CJK text, in characters |
| `latin_per_minute` | `130` | Speaking rate for other text, in words |
| `voice.engine` | `"voicevox"` | Engine name (`voicevox`, `aivis`, `coeiroink`, `sharevox`) or a base URL |
| `voice.speaker` | required when `[voice]` is present | Speaker, as `name/style` |
| `voice.speed` | `1.0` | Speaking speed |
| `refs` | none | Each ref (`owner/repo/deck`) and the 40-character commit it is pinned to. `dek ref` writes it; see [Refs](/reference/cli#refs) |

dek ignores keys it does not know, and lint names each one as `DEK008`, with the key it most likely meant. When `[voice]` is present, `dek new` copies it into the new deck as `voice/voice.toml`.

## Frontmatter

The schema is defined with Zod and written to `.dek/schema.json` on every sync. The `$schema` comment on the first line lets yaml-language-server validate as you type.

```yaml
---
# yaml-language-server: $schema=../../.dek/schema.json
title: How I Built an HTML Slide Tool
description: What a build system for talks looks like, and why the script comes first.
event: Tokyo Frontend Meetup #42
date: 2026-04-18
duration: 20m
ratio: 16:9
lang: en
---
```

| Key | Required | Value |
| --- | --- | --- |
| `title` | yes | String. Used as the heading of the first skeleton slide when its `##` heading is only an id |
| `description` | no | String. The description a shared link shows; without it, `event` and `date` stand in |
| `event` | no | String. Shown by `dek ls`; not placed on any slide |
| `date` | no | `YYYY-MM-DD` |
| `duration` | no | `<n>m`, such as `20m`. The talk's budget |
| `ratio` | no | `16:9` (default, 1280 × 720) or `4:3` (1024 × 768) |
| `lang` | no | BCP 47 tag. Becomes `<html lang>` in the player, screenshots, and PDF. Omit it and dek reads the script: kana means `ja`, then Hangul `ko`, then Han `zh`, and anything else `en` |

Any other key is ignored, and lint names it as `DEK008`.

Section and beat ids match `[a-z0-9-]+` and contain at least one letter. Digits-only ids would collide with numeric `data-step` values.

## `voice/voice.toml`

```toml
engine  = "voicevox"
speaker = "ずんだもん/ノーマル"
speed   = 1
pause   = { sentence = 350, beat = 700 }
```

| Key | Purpose |
| --- | --- |
| `engine` | Engine name or base URL. Default `voicevox`. `DEK_VOICE_URL` overrides it |
| `speaker` | `name/style`. `dek voice speakers` lists what the engine offers |
| `speed` | Speaking speed. Default 1 |
| `pause.sentence` | Silence between sentences, in milliseconds. Default 350 |
| `pause.beat` | Silence at a beat boundary, in milliseconds. Default 700 |
| `lead` | How far each screen change leads its first word, in milliseconds. Default 300 |
| `beats."<key>".lead` | `lead` into one slide's first beat (`slug`) or into one beat (`slug/beat-id`, `slug/2`) |
| `beats."<key>".pause` | Silence after that beat, or after a slide's last beat, replacing `pause.beat` |

## `voice/dict.toml`

Readings for words the engine would otherwise mispronounce. Keys are matched as whole ASCII words, longest first.

```toml
[dek]
kana = "デック"

["script.md"]
kana = "スクリプトエムディー"
```

`dek voice dict add WORD KANA` appends an entry. A word not in the dictionary is `DEK040`.

## Theme tokens

Custom properties every theme publishes on `.slide`. Never on `:root`.

| Token | Role |
| --- | --- |
| `--fg` `--bg` `--accent` `--muted` | Color |
| `--font-title` `--font-body` | Type |
| `--size-title` `--size-body` `--size-caption` | Size |
| `--gap` `--pad` | Space |
| `--radius` | Corners |
| `--step-transition` | Motion |

## Bundled layouts

Values of `data-layout` in the bundled theme.

| Value | Use |
| --- | --- |
| `title` | A title with no beats |
| `default` | The default for slides with beats. Top-aligned, so the heading stays put as elements appear |
| `two-col` | Two columns |
| `full-bleed` | Edge to edge, no padding |
| `quote` | A quotation |

Skeletons use `title` for a section without beats and `default` otherwise.
