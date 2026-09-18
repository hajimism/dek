# 設定

設定ファイルは 2 つ。プロジェクトの `dek.toml` と、デッキの `script.md` frontmatter。

## ディレクトリ

```
my-talks/
├── dek.toml
├── theme.css
├── AGENTS.md
├── assets/
├── decks/
│   └── 2026-04-vite/
│       ├── script.md
│       ├── theme.css
│       ├── voice/                 # 任意
│       │   ├── voice.toml
│       │   ├── dict.toml
│       │   └── pin/
│       ├── slides/
│       └── assets/
├── .dek/
│   ├── schema.json
│   ├── voice/<deck>/
│   └── video/<deck>/
└── dist/
    ├── 2026-04-vite.html
    ├── 2026-04-vite.mp4
    ├── 2026-04-vite.vtt
    ├── 2026-04-vite.chapters.txt
    └── 2026-04-vite.credits.txt
```

単位の説明は [プロジェクト構造](/guide/structure)。

## `dek.toml`

```toml
# dek project
max_classes = 40
cjk_per_minute = 300
latin_per_minute = 130

[voice]
engine = "http://127.0.0.1:50021"
speaker = "1"
speed = 1.0
```

| キー | 既定 | 役割 |
| --- | --- | --- |
| `max_classes` | `40` | DEK013 の上限 |
| `cjk_per_minute` | `300` | 尺の見積もり |
| `latin_per_minute` | `130` | 尺の見積もり |
| `voice.engine` | （任意） | VOICEVOX 互換エンドポイント |
| `voice.speaker` | （`[voice]` があるとき必須） | 話者 |
| `voice.speed` | （任意） | 速度 |

`[voice]` があるとき、`dek new` は `voice/voice.toml` をデッキへコピーする。

## frontmatter

Zod で定義し、`.dek/schema.json` を `sync` のたびに書き出す。frontmatter 冒頭の `$schema` コメントで yaml-language-server に食わせる。

```yaml
---
# yaml-language-server: $schema=../../.dek/schema.json
title: HTML スライドツールを作った話
event: Tokyo Frontend Meetup #42
date: 2026-04-18
duration: 20m
ratio: 16:9
---
```

| キー | 必須 | 値 |
| --- | --- | --- |
| `title` | はい | 文字列 |
| `event` | いいえ | 文字列。`dek ls` とタイトルスライド |
| `date` | いいえ | `YYYY-MM-DD` |
| `duration` | いいえ | `\d+m`。トークの予算 |
| `ratio` | いいえ | `16:9`（既定）または `4:3` |

セクション id は `[a-z0-9-]+` かつ英字を 1 つ含む。数字だけは `data-step` の番号と衝突する。

## 既定トークン

`.slide` 上のカスタムプロパティ。`:root` には置かない。

| トークン | 役割 |
| --- | --- |
| `--fg` `--bg` `--accent` `--muted` | 色 |
| `--font-title` `--font-body` | 書体 |
| `--size-title` `--size-body` `--size-caption` | 字サイズ |
| `--gap` `--pad` | 余白 |
| `--radius` | 角丸 |
| `--step-transition` | モーション |

## 既定レイアウト

`data-layout` の値。既定テーマが持つ。

| 値 | 用途 |
| --- | --- |
| `title` | ビートの無いタイトル |
| `default` | ビート付きの既定 |
| `two-col` | 2 カラム |
| `full-bleed` | 全面 |
| `quote` | 引用 |

骨格 HTML は、ビートがなければ `title`、あれば `default`。
