# dek

**台本から組み立てる HTML スライド。** 喋ることを書く。スライドはそこから生える。

[ドキュメント](https://hajimism.github.io/dek/ja/) · [English README](./README.md)

dek は、トークの台本からスライドを組み立てる CLI です。台本を Markdown で書くと、`##` の見出しひとつが 1 枚の HTML スライドになります。プロジェクトが複数のデッキを持つので、テーマも規約も前回のトークから次のトークへ引き継がれます。AI エージェントと一緒に作ることを、最初から前提に設計しています。

> *dek* は *deck* から一文字落とした綴りです。npm の `deck` は Kong の decK が使っています。

## なぜ dek か

**スライドは喋るためにあります。** 主流のツールはどれも空の箱から始まり、埋めれば埋めるほど資料は立派になり、本番で喋り切るのは難しくなる。dek は反対側から始めます。何を、どの順で、どれだけの尺で喋るか。そのうえで、画面に何が出ているべきか。台本が親で、スライドはそこから派生します。

**トークは一度きりではありません。** dek のプロジェクトは複数のデッキを入れる場所です。規約はプロジェクトのもの、見た目は前回のデッキの続きから、台本とスライドはデッキごと。

**エージェントには小さなファイルが要ります。** 1 スライドは約 40 行の HTML ファイルひとつ。編集対象は小さく、差分は読め、壊れてもその 1 枚で済みます。

**エージェントは自分の描画結果を見られません。** dek はスライドを描画し、はみ出し、コントラスト、欠けた画像を機械可読な診断として返します。エージェントが自分の出力を確かめ、自分で直せます。

三原則と Slidev との比較は [dek の設計思想](https://hajimism.github.io/dek/ja/guide/why.html) にあります。

## クイックスタート

[Bun](https://bun.sh) 1.3 以上。dek は npm にはなく、GitHub から実行します。

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks
bun add github:hajimism/dek
cd decks/2026-04-vite
```

プロジェクトを作るのは最初の一度だけです。`bun add` のあとは `bunx dek` で足ります。残るのは 3 手で、ライブ発表ならこれがすべてです。

```bash
$EDITOR script.md   # 1. 喋ることを書く。時間をかけるのはここ
bunx dek            # 2. 開発サーバ。骨格スライドが生え、保存のたびに描画と lint
bunx dek build      # 3. dist/2026-04-vite.html — トーク全体がこの 1 ファイル
```

台本を書いて `dek` を叩けば、HTML を一行も書かずに同梱テーマで発表できます。

続きは [はじめる](https://hajimism.github.io/dek/ja/guide/getting-started.html)へ。通しで 1 本作るなら [チュートリアル](https://hajimism.github.io/dek/ja/guide/tutorial.html)。コマンドの一覧は [CLI リファレンス](https://hajimism.github.io/dek/ja/reference/cli.html)にあります。

## サンプル

`sample/` は dek 自身を題材にした約 8 分のデッキで、Playwright、rumdl、声まで入れたフル構成のプロジェクトです。手順は [sample/README.ja.md](sample/README.ja.md)。

```bash
cd sample
bun install
bun run setup          # Playwright 用の Chromium
bun run dev            # または bun run lint:visual / bun run build
```

## 開発

```bash
bun install
bun test --watch
bun run typecheck
bun run check             # Biome の format + lint
bun run docs:dev          # VitePress
```

CI では `biome ci`、`typecheck`、全テスト、`docs:build` を走らせます。

ドキュメントサイトは GitHub Actions 経由で GitHub Pages に出します。初回だけ、リポジトリの設定で **Pages → Source** を **GitHub Actions** にしてください。

## ライセンス

MIT
