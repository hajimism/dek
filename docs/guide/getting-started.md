# はじめる

このページでやること:

1. dek を入れる
2. プロジェクトと最初のデッキを作る
3. 台本を書いて、骨格のままブラウザで送る
4. 会場用の単一 HTML を書き出す

HTML はまだ書かない。声も動画も出さない。成功条件は、同梱テーマの骨格スライドで喋れること。

## 前提

[Bun](https://bun.sh) 1.3 以上。

dek は npm に載せていない。GitHub から実行する。

```bash
bunx github:hajimism/dek
```

トーク用プロジェクトに固定するなら、そのディレクトリで:

```bash
bun add github:hajimism/dek
```

固定したあとは `bunx dek` で足りる。`bunx` は PATH に `dek` を置かない。*dek* は *deck* の異綴りで、Kong の decK が `deck` を使っているため一文字落としている。

## プロジェクトを作る

dek のリポジトリの外で、トーク用のプロジェクトを作る。

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks
bun add github:hajimism/dek
cd decks/2026-04-vite
```

プロジェクトを作るのは最初の一度だけ。最初のデッキも一緒にできる。`bun add` は CLI をプロジェクトに固定するだけで、デッキの HTML は `node_modules` を見ない。

## 何ができたか

```
my-talks/
├── package.json
├── dek.toml
├── theme.css
├── AGENTS.md
├── assets/
├── decks/
│   └── 2026-04-vite/
│       ├── script.md
│       ├── theme.css
│       ├── slides/
│       └── assets/
└── .dek/
    └── schema.json
```

`decks/` はデッキが 1 つでも必ずある。プロジェクト直下の `theme.css` は新しいデッキの出発点で、`dek init` / `dek new` がデッキの中へコピーする。

## 台本を書く

`script.md` を開く。見出しひとつが 1 枚になる。

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

`##` がスライド、`###` がその中のビート。段落が喋り。`>` はディレクションで、声にも尺にも入らない。

## 開発サーバを起動する

デッキの中で:

```bash
bunx dek
```

見出しから骨格スライドが生える。保存のたびに描画と lint が走る。ブラウザで送り、ビートが進むことを確認する。

明示的に `dek sync` や `dek lint` を叩く必要はない。

## 会場 HTML を書き出す

```bash
bunx dek build
```

`my-talks/dist/2026-04-vite.html` ができる。この 1 ファイルをブラウザで開けば発表できる。

## 次

- 台本の書き方を固める → [台本](./script)
- 1 枚の見た目を整える → [スライド](./slides)
- エージェントと回す → [AI と作る](./ai)
