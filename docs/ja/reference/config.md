# 設定

設定する場所は 3 つです。プロジェクトの `dek.toml`、各デッキの `script.md` の frontmatter、そしてデッキ内の任意の `voice/` ファイル群。

## ディレクトリ構成

```
my-talks/
├── dek.toml
├── .gitignore
├── .rumdl.toml
├── theme.css
├── tsconfig.json
├── AGENTS.md
├── assets/
├── refs/                          # gitignore される。[refs] から取り直せる
│   └── owner/repo/deck/
├── decks/
│   └── 2026-04-vite/
│       ├── script.md
│       ├── theme.css
│       ├── voice/                 # 任意
│       │   ├── voice.toml
│       │   ├── dict.toml
│       │   └── pin/
│       ├── slides/
│       ├── assets/
│       ├── dist/
│       │   ├── 2026-04-vite.html
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
    └── server.json                # 開発サーバの起動中だけ
```

プロジェクトとデッキの境界は[プロジェクトとデッキ](/ja/guide/structure)で説明しています。

## `dek.toml`

```toml
# dek project
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

| キー | 既定 | 役割 |
| --- | --- | --- |
| `max_classes` | `40` | `DEK013` の上限 |
| `cjk_per_minute` | `300` | CJK テキストの話速（字/分） |
| `latin_per_minute` | `130` | それ以外のテキストの話速（語/分） |
| `voice.engine` | `"voicevox"` | エンジン名（`voicevox`、`aivis`、`coeiroink`、`sharevox`）またはベース URL |
| `voice.speaker` | `[voice]` があるとき必須 | 話者。`名前/スタイル` の形 |
| `voice.speed` | `1.0` | 話速 |
| `refs` | なし | ref（`owner/repo/deck`）ごとに、固定したコミットの40桁の sha。`dek ref` が書く。[ref](/ja/reference/cli#ref) を参照 |

dek は知らないキーを無視し、lint がそれぞれを `DEK008` として、おそらく意図したキーと一緒に示します。`[voice]` があるとき、`dek new` はそれを新しいデッキへ `voice/voice.toml` としてコピーします。

## frontmatter

スキーマは Zod で定義され、sync のたびに `.dek/schema.json` に書き出されます。1 行目の `$schema` コメントで yaml-language-server が入力中に検証してくれます。

```yaml
---
# yaml-language-server: $schema=../../.dek/schema.json
title: HTML スライドツールを作った話
event: Tokyo Frontend Meetup #42
date: 2026-04-18
duration: 20m
ratio: 16:9
lang: ja
---
```

| キー | 必須 | 値 |
| --- | --- | --- |
| `title` | はい | 文字列。先頭の `##` 見出しが id だけのとき、その骨格スライドの見出しになる |
| `event` | いいえ | 文字列。`dek ls` に表示される。スライドには入らない |
| `date` | いいえ | `YYYY-MM-DD` |
| `duration` | いいえ | `<n>m`（例: `20m`）。トークの予算 |
| `ratio` | いいえ | `16:9`（既定、1280 × 720）または `4:3`（1024 × 768） |
| `lang` | いいえ | BCP 47 タグ。プレイヤー、スクリーンショット、PDF の `<html lang>` になる。省くと台本から決める。かながあれば `ja`、次にハングルなら `ko`、漢字なら `zh`、それ以外は `en` |

これ以外のキーは無視され、lint が `DEK008` として示します。

セクションとビートの id は `[a-z0-9-]+` にマッチし、英字を 1 文字以上含みます。数字だけの id は数値の `data-step` と衝突します。

## `voice/voice.toml`

```toml
engine  = "voicevox"
speaker = "ずんだもん/ノーマル"
speed   = 1
pause   = { sentence = 350, beat = 700 }
```

| キー | 役割 |
| --- | --- |
| `engine` | エンジン名かベース URL。既定 `voicevox`。`DEK_VOICE_URL` が優先する |
| `speaker` | `名前/スタイル`。`dek voice speakers` でエンジンの話者を一覧できる |
| `speed` | 話速。既定 1 |
| `pause.sentence` | 文と文の間の無音（ミリ秒）。既定 350 |
| `pause.beat` | ビート境界の無音（ミリ秒）。既定 700 |
| `lead` | 画面の切り替えを第一声より何ミリ秒先にするか。既定 300 |
| `beats."<key>".lead` | 1 枚の最初のビート（`slug`）、または 1 ビート（`slug/beat-id`、`slug/2`）だけの `lead` |
| `beats."<key>".pause` | そのビート、またはその枚の最後のビートの直後の無音。`pause.beat` の代わり |

## `voice/dict.toml`

エンジンが読み間違える単語の読みです。キーは ASCII の単語全体に、長いものから順にマッチします。

```toml
[dek]
kana = "デック"

["script.md"]
kana = "スクリプトエムディー"
```

`dek voice dict add WORD KANA` でエントリを追加できます。辞書にない単語は `DEK040` です。

## テーマのトークン

すべてのテーマが `.slide` に公開するカスタムプロパティです。`:root` には置きません。

| トークン | 役割 |
| --- | --- |
| `--fg` `--bg` `--accent` `--muted` | 色 |
| `--font-title` `--font-body` | 書体 |
| `--size-title` `--size-body` `--size-caption` | 字の大きさ |
| `--gap` `--pad` | 余白 |
| `--radius` | 角丸 |
| `--step-transition` | 動き |

## 同梱レイアウト

同梱テーマの `data-layout` の値です。

| 値 | 用途 |
| --- | --- |
| `title` | ビートのないタイトル |
| `default` | ビート付きスライドの既定。上詰めなので、要素が増えても見出しが動かない |
| `two-col` | 2 カラム |
| `full-bleed` | 余白なしの全面 |
| `quote` | 引用 |

骨格は、ビートのないセクションに `title`、あるセクションに `default` を使います。
