---
description: 'ディレクトリ構成、`dek.toml`、frontmatter、`voice.toml`、`dict.toml`、テーマトークン、同梱レイアウト。'
---

# 設定

設定を置く場所は 3 つです。プロジェクト全体の `dek.toml`、各デッキの `script.md` にある frontmatter、そしてデッキ内の任意の `voice/` ファイル群です。

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
├── refs/                          # gitignore 対象。[refs] から再取得できる
│   ├── owner/repo/deck/
│   └── file/deck/                 # pack の実体。packs/ から再展開する
├── packs/                         # コミット対象。dekc ref で固定した pack
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
    ├── server.json                # プロジェクト全体の開発サーバー起動中のみ存在
    └── servers/                   # dek が .gitignore を置き、フォルダごと無視する
        └── 2026-04-vite.json      # 該当デッキ専用の開発サーバー起動中のみ存在
```

プロジェクトとデッキの境界については[プロジェクトとデッキ](/ja/guide/structure)を参照してください。

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

[pack]
license = "CC0-1.0"

[refs]
"hajimism/dek/why-dek" = "89fbd5a0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6"

[plugins.study]
```

| キー | 既定 | 役割 |
| --- | --- | --- |
| `url` | なし | `dist/` を公開する `http(s)` の絶対 URL。指定すると `dekc build` が `og:url` と 1 枚目の `og:image` を出力する（`--url` が優先）。[Web で公開する](/ja/guide/present#web-で公開する)を参照 |
| `max_classes` | なし | 新しいデッキの `max_classes` の初期値。[frontmatter](#frontmatter) を参照 |
| `cjk_per_minute` | なし | 新しいデッキの `cjk_per_minute` の初期値 |
| `latin_per_minute` | なし | 新しいデッキの `latin_per_minute` の初期値 |
| `voice.engine` | `"voicevox"` | エンジン名（`voicevox`・`aivis`・`coeiroink`・`sharevox`）、ローカルポート付きの名前（`voicevox:50021`）、またはベース URL |
| `voice.speaker` | `[voice]` があるとき必須 | 話者（`名前/スタイル` の形式） |
| `voice.speed` | `1.0` | 話速 |
| `pack.license` | なし（`dekc init` は `"CC0-1.0"` を設定） | `dekc pack` でデッキを渡す際のライセンス。`"CC0-1.0"` なら受け手は出典表示なしで自由に再利用でき、`"CC-BY-4.0"` なら出典表示を求める。指定するとプロジェクトの `LICENSE` の代わりに該当本文を pack 内へ同梱する。未指定時はプロジェクトの `LICENSE` を使い、それもなければライセンスなしで出力して警告する（GitHub の ref はリポジトリ側の `LICENSE` を読む） |
| `refs` | なし | 各 ref の固定先。`owner/repo/deck` は 40 桁のコミット SHA、pack の `file/<deck>` は中身ファイルの 64 桁 SHA-256。デッキ名に使えるのは文字・数字・ドット・ハイフン・アンダースコア（64 文字・200 バイト以内、先頭ハイフン不可、不可視文字不可、結合文字は NFC 正規化済み）。不正なキーがあると `dek.toml` 自体が読み込めず、エラーに行番号が出る（該当行と、pack なら `packs/<deck>.tgz`・`refs/file/<deck>` を消して固定し直す）。通常は `dekc ref` が自動更新する。[ref](/ja/reference/cli#ref) を参照 |
| `plugins` | なし | プロジェクトで使う[プラグイン](/ja/reference/plugins)ごとのテーブル `[plugins.<name>]`（ユーザーが導入した `dek-<name>` に対応）。名前は小文字英字で始まる小文字英数字とハイフン、40 文字以内（`dek` と `md` は予約）。テーブル内にキーは書けず、書くと `DEK008` になる。プロジェクト側で指定できるのはプラグイン名だけで、実行パスやプログラムは指定できない。`dekc sync` が `plugins/<name>/plugin.json` にロックする |

未定義のキーは実行時には無視され、lint が `DEK008` として候補キーの hint 付きで警告します。

`max_classes`・`cjk_per_minute`・`latin_per_minute`・`[voice]` は新規デッキ向けの初期値です。`dekc new` が前 3 つを新しいデッキの frontmatter に、`[voice]` を `voice/voice.toml` にコピーし、以降は各デッキが自分の設定だけを読みます。`dek.toml` を後から変更しても既存デッキには影響しません。なお、`dek.toml` に既定と異なる値が設定されているのにデッキ側へそのキーがない場合は `DEK008` の警告になり、追記すべき行が hint に表示されます。

## frontmatter

スキーマは Zod で定義されており、`sync` のたびに `.dek/schema.json` へ書き出されます。先頭行の `$schema` コメントにより、yaml-language-server が入力中にリアルタイム検証してくれます。

```yaml
---
# yaml-language-server: $schema=../../.dek/schema.json
title: HTML スライドツールを作った話
description: 発表のためのビルドシステムとは何か、なぜ台本から始めるのか。
event: Tokyo Frontend Meetup #42
date: 2026-04-18
duration: 20m
ratio: 16:9
lang: ja
---
```

| キー | 必須 | 値 |
| --- | --- | --- |
| `title` | はい | 文字列。先頭の `##` 見出しが id だけのとき、その骨格スライドの見出しに使われる |
| `description` | いいえ | 文字列。共有リンクのカードに出る説明文。未指定時は `event` と `date` から生成 |
| `event` | いいえ | 文字列。`dekc ls` に表示される（スライドには自動挿入されない） |
| `date` | いいえ | `YYYY-MM-DD` |
| `duration` | いいえ | `<n>m`（例：`20m`）。トークの持ち時間 |
| `ratio` | いいえ | `16:9`（既定、1280 × 720）または `4:3`（1024 × 768） |
| `lang` | いいえ | BCP 47 言語タグ。プレイヤー・スクリーンショット・PDF の `<html lang>` に使われる。省略時は台本から自動判定（かながあれば `ja`、次にハングルなら `ko`、漢字なら `zh`、それ以外は `en`） |
| `max_classes` | いいえ | `theme.css` で定義できるクラス数の上限（`DEK013`）。既定 `40` |
| `cjk_per_minute` | いいえ | CJK テキストの話速（字/分）。既定 `300` |
| `latin_per_minute` | いいえ | それ以外のテキストの話速（語/分）。既定 `130` |
| `pub` | いいえ | [dek.pub](/ja/guide/publish) のデッキ ID（`d_` に続く小文字英数字 10〜32 文字）。初回公開時に `dekc pub publish` が自動で書き込む。どのチェックアウトから公開しても同じデッキが更新されるようコミットする。未設定時は `--slug` またはフォルダ名で新規作成する（既存 slug と重複する場合は `--slug` の指定が必要） |

上記以外のキーは無視され、lint が `DEK008` で警告します。

セクションとビートの id は `[a-z0-9-]+` に一致し、英字を 1 文字以上含む必要があります（数字だけの id は数値指定の `data-step` と衝突します）。

## `voice/voice.toml`

```toml
engine  = "voicevox"
speaker = "ずんだもん/ノーマル"
speed   = 1
pause   = { sentence = 350, beat = 700 }
```

| キー | 役割 |
| --- | --- |
| `engine` | エンジン名またはベース URL。既定 `voicevox`（`DEK_VOICE_URL` が優先） |
| `speaker` | `名前/スタイル`。`dekc voice speakers` で一覧を確認できる |
| `speed` | 話速。既定 `1` |
| `pause.sentence` | 文と文のあいだの無音時間（ミリ秒）。既定 `350` |
| `pause.beat` | ビート境界の無音時間（ミリ秒）。既定 `700` |
| `lead` | 画面切り替えを第一声より何ミリ秒先行させるか。既定 `300` |
| `beats."<key>".lead` | 特定のスライド表示直前（`slug`・`slug/0`）または特定ビート（`slug/beat-id`・`slug/2`）専用の `lead` |
| `beats."<key>".pause` | 該当ビート（またはスライド最終ビート）直後の無音時間。`pause.beat` を上書き |

## `voice/dict.toml`

音声合成エンジンが読み間違える単語の読み辞書です。キーは ASCII の単語全体に対して、長いキーから順にマッチします。

```toml
[dek]
kana = "デック"

["script.md"]
kana = "スクリプトエムディー"
```

`dekc voice dict add <word> <kana>` で項目を追加できます。キーはロケール非依存の文字コード順でソートして書き出すため、どの環境で追加しても差分が安定します。辞書に未登録の ASCII 単語は `DEK040` で警告されます。

## テーマのトークン

すべてのテーマが `.slide` に公開する必須カスタムプロパティです（`:root` には置きません）。

| トークン | 役割 |
| --- | --- |
| `--fg` `--bg` `--accent` `--muted` | 色 |
| `--font-title` `--font-body` | 書体 |
| `--size-title` `--size-body` `--size-caption` | 文字サイズ |
| `--gap` `--pad` | 余白 |
| `--radius` | 角丸 |
| `--step-transition` | 動き |

## 同梱レイアウト

同梱テーマが定義している `data-layout` の値です。

| 値 | 用途 |
| --- | --- |
| `title` | ビートのないタイトルスライド |
| `default` | ビート付きスライドの既定。上詰めなので要素が増えても見出し位置が動かない |
| `two-col` | 2 カラム |
| `full-bleed` | 余白なしの全面表示 |
| `quote` | 引用 |

骨格生成時は、ビートのないセクションに `title`、ビートのあるセクションに `default` が選ばれます。
