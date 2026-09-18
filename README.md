# dek

**台本から組み立てる HTML スライド。** — *Talk-script-first HTML slides.*

`dek` はトークスクリプトを起点にスライドを組み立てる CLI です。台本を Markdown で書き、その見出しひとつひとつが 1 枚の HTML スライドになります。テーマと規約はプロジェクトで共有し、発表のたびにデッキを足していく。AI エージェントと一緒に作ることを前提に設計されています。

**ドキュメント:** [hajimism.github.io/dek](https://hajimism.github.io/dek/)

> *dek* は *deck* の異綴りです。`deck` は Kong の decK が使っているため一文字落としています。導入前に `command -v dek` で `PATH` の衝突だけ確認してください。

## Why

**スライドは喋るための資料です。** ところが PowerPoint も Google Slides も Slidev も、まず箱を置き、あとから中身を考える順序で作られています。その結果、立派だが本番で喋り切れない資料ができあがる。本来の順序は逆です。何を、どの順で、どれだけの尺で喋るか → その瞬間に画面に何が出ているべきか。`dek` は `script.md` を親に据え、スライドはそこから生やします。

**トークは一度きりではありません。** 発表のたびに新しいリポジトリを切ると、見た目も規約も毎回ゼロから積み直すことになります。`dek` はプロジェクトを一度作り、その中にデッキを溜めていきます。規約はプロジェクトのもの、見た目は前回の続きから、台本とスライドはデッキごと。過去のデッキがそのまま次の出発点になります。

**AI と作るなら、ファイルは小さく分かれているべきです。** 3,000 行の `slides.md` の 7 枚目だけを直す、というタスクは LLM にとって不必要に難しい。1 スライド = 1 HTML なら、編集対象は 40 行のファイルがひとつ。差分が読め、壊れてもその 1 枚で済みます。

**AI は自分が書いた HTML がどう見えるか知りません。** 文字が枠からはみ出していても、テキストとして出力された HTML は完璧に見える。人間が本番 30 分前に気づきます。`dek` は描画結果を機械可読な診断として返し、AI が自分で確認して直すループを回せるようにします。

三原則、Slidev との違い、スコープ外は [なぜ dek か](https://hajimism.github.io/dek/guide/why.html) にあります。

## Quick Start

まだ npm には載せていません。リポジトリから入れます。

```bash
git clone https://github.com/hajimism/dek.git
cd dek
bun install
bun link
```

プロジェクトを作るのは最初の一度だけです。最初のデッキも一緒に作れます。

```bash
dek init my-talks --deck 2026-04-vite
cd my-talks/decks/2026-04-vite
```

あとは 3 手です。ライブ専用ならここで終わります。

```bash
$EDITOR script.md   # ① 喋ることを書く（ここに一番時間をかける）
dek                 # ② 開発サーバ。見出しからスライドが生え、保存のたびに描画と lint が走る
dek build           # ③ ../../dist/2026-04-vite.html — この 1 ファイルで発表できる
```

`script.md` を書いて `dek` を叩けば、骨格スライドが生えて同梱テーマのまま喋れます。HTML を一行も書く必要はありません。

続きは [はじめる](https://hajimism.github.io/dek/guide/getting-started.html)。コマンド一覧は [CLI](https://hajimism.github.io/dek/reference/cli.html)。

## 開発

```bash
bun install
bun test --watch
bun run typecheck
bun run check             # Biome format + lint
bun run docs:dev          # VitePress
```

CI は `biome ci`、`typecheck`、全テスト、`docs:build` を必須にする。

ドキュメントサイトは GitHub Pages（Actions）で出します。初回だけリポジトリの **Settings → Pages → Source: GitHub Actions** を選んでください。

## ライセンス

MIT
