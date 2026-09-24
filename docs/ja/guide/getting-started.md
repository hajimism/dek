# はじめる

このページでは、何もない状態から発表できるデッキまでを作ります。やることは 4 つです。

1. dek を入れる
2. プロジェクトと最初のデッキを作る
3. 台本を書き、生成されたスライドをブラウザで送る
4. 会場用の HTML を 1 ファイル書き出す

HTML は書きません。声も動画も触りません。ゴールは、同梱テーマの骨格スライドで喋れる状態です。

## 前提

[Bun](https://bun.sh) 1.3 以上。dek は npm に公開していないので、GitHub から直接実行します。

```bash
bunx github:hajimism/dek
```

プロジェクトに固定するなら、そのディレクトリで依存に加えます。以降は `bunx dek` で足ります。

```bash
bun add github:hajimism/dek
```

::: tip なぜ「dek」か
*dek* は *deck* から一文字落とした綴りです。npm の `deck` は Kong の decK が使っています。
:::

## プロジェクトを作る

dek のリポジトリの外に、トーク用のプロジェクトを作ります。

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks
bun add github:hajimism/dek
cd decks/2026-04-vite
```

プロジェクトを作るのは最初の一度だけです。最初のデッキも一緒にできます。`bun add` は CLI のバージョンを固定するだけで、デッキの HTML が `node_modules` を見ることはありません。

## 何ができたか

```
my-talks/
├── package.json
├── dek.toml            # lint の閾値と話速
├── .gitignore          # dist/ .cache/ .dek/server.json
├── .rumdl.toml         # script.md 用の Markdown ルール
├── theme.css           # 新しいデッキの出発点
├── tsconfig.json       # スライドのスクリプト用のエディタ設定
├── assets/             # 素材置き場。デッキは使うものをコピーする
├── decks/
│   └── 2026-04-vite/
│       ├── script.md   # 唯一の真実
│       ├── theme.css   # このデッキ専用のコピー
│       ├── slides/     # 1 スライド 1 HTML
│       └── assets/
└── .dek/
    ├── schema.json     # frontmatter のスキーマ（エディタ用）
    └── slide.d.ts      # スライドのスクリプト用の DekSlide 型
```

デッキが 1 つでも `decks/` は必ずあります。プロジェクト直下の `theme.css` はテンプレートで、`dek init` と `dek new` が新しいデッキの中へコピーします。

## 台本を書く

`script.md` を開きます。`##` の見出しひとつが 1 枚になります。

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

## architecture

さて、ここが今日いちばん覚えて帰ってほしいところです。

### script.md が親 {#script-parent}

まず script.md がいて、

### スライドがぶら下がる {#slides-hang}

その下にスライドがぶら下がっている。逆ではありません。
```

覚えることは少しです。`##` が 1 枚。`###` は **ビート** で、喋りの区切りであり、画面が進んでもよい瞬間です。段落が喋る言葉。`>` の引用はト書きで、声にも尺にも入りません。

## 開発サーバを起動する

デッキの中で:

```bash
bunx dek
```

見出しごとに骨格スライドが生成されます。先頭のセクションはデッキの `title` を見出しに取り、`## architecture` はビートを列挙した 1 枚になります。保存するたびに再描画、再同期、lint が走ります。表示された URL を開いて右矢印を押し、ビートが順に現れるのを確かめてください。

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
