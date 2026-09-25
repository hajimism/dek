# はじめる

このページでは、何もない状態から発表できるデッキまでを作ります。やることは 3 つです。

1. プロジェクトと最初のデッキを作り、dek をそこに入れる
2. 台本を書き、生成されたスライドをブラウザで送る
3. 会場用の HTML を 1 ファイル書き出す

HTML は書きません。声も動画も触りません。ゴールは、同梱テーマの骨格スライドで喋れる状態です。

## 前提

[Bun](https://bun.sh) 1.3 以上。dek はまだ npm になく、最初のコマンドは GitHub から直接実行します。

::: tip なぜ「dek」か
*dek* は *deck* から一文字落とした綴りです。npm の `deck` は Kong の decK が使っています。
:::

## プロジェクトを作る

dek のリポジトリの外に、トーク用のプロジェクトを作ります。

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
```

`init` は書いたファイルを並べ、最後に次に打つコマンドを表示します。

```
next:
  cd my-talks
  bun add -d github:hajimism/dek
  cd decks/2026-04-vite
  $EDITOR script.md
  bunx dek
```

上から順に実行します。`bun add -d` で dek をプロジェクトに入れ、以降の `bunx dek` はその dek を動かします。固定されるのは CLI のバージョンだけで、デッキの HTML が `node_modules` を見ることはありません。

::: warning `bunx dek` はプロジェクトの中でだけ動く
npm の `dek` は無関係の別パッケージです。`bunx dek` はプロジェクトに入れた dek を動かし、それ以外の場所ではその別パッケージをダウンロードして実行します。プロジェクトの外では `bunx github:hajimism/dek` を使ってください。パッケージ名は `@hajimism/dek` で、npm に公開したあとは `bun add -d @hajimism/dek` が GitHub からのインストールに代わります。
:::

プロジェクトを作るのは最初の一度だけです。最初のデッキも一緒にでき、以降は `dek new <name>` で足します。`init` をもう一度実行しても安全です。足りないものだけを書き、あるファイルはすべて残し、`init` の内容と違うものには `(kept)` と表示します。プロジェクトの中では 2 つ目のプロジェクトを作らず、`dek new` を案内します。

## 何ができたか

```
my-talks/
├── package.json        # `bun add` が作り、dek のバージョンを固定する
├── dek.toml            # プロジェクトの設定。既定値を変えるまでは空
├── AGENTS.md           # AI エージェント向けの規約。sync のたびに書き直す
├── .gitignore          # dist/ .cache/ .dek/server.json node_modules/ refs/
├── .rumdl.toml         # script.md 用の Markdown ルール
├── theme.css           # 新しいデッキの出発点
├── tsconfig.json       # スライドのスクリプト用のエディタ設定
├── assets/             # 素材置き場。デッキは使うものをコピーする
├── decks/
│   └── 2026-04-vite/
│       ├── script.md   # 唯一の真実
│       ├── theme.css   # このデッキ専用のコピー
│       ├── slides/     # 1 スライド 1 HTML。最初は骨格
│       └── assets/
└── .dek/
    ├── schema.json     # frontmatter のスキーマ（エディタ用）
    └── slide.d.ts      # スライドのスクリプト用の DekSlide 型
```

デッキが 1 つでも `decks/` は必ずあります。プロジェクト直下の `theme.css` はテンプレートで、`dek init` と `dek new` が新しいデッキの中へコピーします。

## 台本を書く

`script.md` を開きます。`init` が短いお手本の台本を書いてあり、中身がそのまま使い方の説明です。セクションがスライドに、`###` の見出しがビートになり、1 分の `duration` が持ち時間なので、`bunx dek ls` の時点で見積もりと持ち時間が並びます。これを自分のトークに書き換えます。`##` の見出しひとつが 1 枚になります。

```markdown
---
# yaml-language-server: $schema=../../.dek/schema.json
title: HTML スライドツールを作った話
event: Tokyo Frontend Meetup #42
date: 2026-04-18
duration: 20m
---

## intro

こんにちは。今日は、スライドツールを自分で作った話をします。

> 自己紹介は短く。時計を見ない。

## 今日持ち帰ってほしいこと {#architecture}

さて、ここが今日いちばん覚えて帰ってほしいところです。

### script.md が親 {#script-parent}

まず script.md がいて、

### スライドがぶら下がる {#slides-hang}

その下にスライドがぶら下がっている。逆ではありません。
```

覚えることは少しです。`##` が 1 枚。`###` は **ビート** で、喋りの区切りであり、画面が進んでもよい瞬間です。段落が喋る言葉。`>` の引用はト書きで、声にも尺にも入りません。

見出しは表示される文字で、`{#id}` がスライドのファイル名になります。`## intro` は id だけの見出しで、`slides/intro.html` を名付けますが、スライド自身のタイトルにはなりません。先頭のセクションは代わりにデッキの `title` を取り、2 枚目以降で id だけの見出しはタイトルのないスライドになります。そういう見出しには、`## 今日持ち帰ってほしいこと {#architecture}` のように文字と id を両方書きます。

## 開発サーバを起動する

デッキの中で:

```bash
bunx dek
```

見出しごとに骨格スライドが生成されます。先頭のセクションはデッキの `title` を見出しに取り、「今日持ち帰ってほしいこと」はビートを列挙した 1 枚になります。保存するたびに再描画、再同期、lint が走ります。表示された URL を開いて右矢印を押し、ビートが順に現れるのを確かめてください。

サーバが立っている間、`dek sync` や `dek lint` を自分で叩く必要はありません。

## 会場用に書き出す

```bash
bunx dek build
```

`decks/2026-04-vite/dist/2026-04-vite.html` ができます。この 1 ファイルをブラウザで開けば発表できます。プロジェクト直下の `dist/` にまとめたいときは `--root-dist` を付けます。

## 次

- 通しで 1 本作る → [チュートリアル](./tutorial)
- 台本のルールを詰める → [台本](./script)
- 1 枚の見た目を整える → [スライド](./slides)
- エージェントに渡す → [AI エージェントと作る](./ai)
