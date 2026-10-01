# dekc

**発表のビルドシステム。** 喋ることを書けば、あとは dekc が組み立て、測り、届ける。

[ドキュメント](https://hajimism.github.io/dekc/ja/) · [English README](./README.md)

dekc は、ビルドシステムがコードを扱うように発表を扱う CLI です。ソースは Markdown で書くトークの台本で、`##` の見出しひとつが 1 枚の HTML スライドになります。同じソースから、尺を見積もり、どのスライドも lint して描画を測り、1 ファイルの HTML、PDF、読み上げ付きの動画をビルドします。プロジェクトが複数のデッキを持つので、テーマも規約も前回のトークから次のトークへ引き継がれます。AI エージェントと一緒に作ることを、最初から前提に設計しています。

## なぜ dekc か

**スライドは喋るためにあります。** 主流のツールはどれも空の箱から始まり、埋めれば埋めるほど資料は立派になり、本番で喋り切るのは難しくなる。dekc は反対側から始めます。何を、どの順で、どれだけの尺で喋るか。そのうえで、画面に何が出ているべきか。台本が親で、スライドはそこから派生します。

**トークは一度きりではありません。** dekc のプロジェクトは複数のデッキを入れる場所です。規約はプロジェクトのもの、見た目は前回のデッキの続きから、台本とスライドはデッキごと。

**エージェントには小さなファイルが要ります。** 1 スライドは約 40 行の HTML ファイルひとつ。必要なら CSS とスクリプトを横に置けます。編集対象は小さく、差分は読め、壊れてもその 1 枚で済みます。

**エージェントは自分の描画結果を見られません。** dekc はスライドを描画し、はみ出し、コントラスト、欠けた画像を機械可読な診断として返します。エージェントが自分の出力を確かめ、自分で直せます。

三原則と Slidev との比較は [dekc の設計思想](https://hajimism.github.io/dekc/ja/guide/why.html) にあります。

## クイックスタート

[Bun](https://bun.sh) 1.4 以上。dekc はまだ npm になく、GitHub から入れます。

```bash
bunx github:hajimism/dekc init my-talks --deck 2026-04-vite
cd my-talks
bun add -d github:hajimism/dekc
cd decks/2026-04-vite
```

`init` は終わりに同じ手順を表示します。プロジェクトを作るのは最初の一度だけです。dekc をプロジェクトの開発依存に入れたあとは `bunx dekc` で動きます。残るのは 3 手で、ライブ発表ならこれがすべてです。

> [!WARNING]
> 打つのは `dek` ではなく `dekc` です。npm の `dek` は無関係の別パッケージで、`bunx dek` はそれをダウンロードして実行します。dekc が npm に公開されるまでは、`bunx dekc` が動くのは dekc を入れたプロジェクトの中だけで、それ以外の場所では失敗します。公開したあとは `bun add -d dekc` が GitHub からのインストールに代わり、`bunx dekc` はどこでも動きます。

```bash
$EDITOR script.md   # 1. 喋ることを書く。時間をかけるのはここ
bunx dekc            # 2. 開発サーバ。骨格スライドが生え、保存のたびに描画と lint
bunx dekc build      # 3. dist/2026-04-vite.html — トーク全体がこの 1 ファイル
```

台本を書いて `dekc` を叩けば、HTML を一行も書かずに同梱テーマで発表できます。

続きは [はじめる](https://hajimism.github.io/dekc/ja/guide/getting-started.html)へ。通しで 1 本作るなら [チュートリアル](https://hajimism.github.io/dekc/ja/guide/tutorial.html)。コマンドの一覧は [CLI リファレンス](https://hajimism.github.io/dekc/ja/reference/cli.html)にあります。

## サンプル

`sample/` は Playwright、rumdl、声まで入れたフル構成のプロジェクトで、3 つのデッキが入っています。どれも dekc 自身が題材で、配布資料としても読める約 12 分の解説 `why-dekc`、ターミナルで発表を作ってみせる 3 分のライトニングトーク `lightning`、スライドを AI エージェントに任せる 6 分のトーク `with-agents` です。手順は [sample/README.ja.md](sample/README.ja.md)。

```bash
cd sample
bun install
bun run setup          # Playwright 用の Chromium
bun run dev            # または bun run lint:visual / bun run build
```

## 開発

```bash
bun install
bunx playwright install chromium   # 最初に一度。実ブラウザを動かすテストに使う
bun test --watch
bun run typecheck
bun run check             # Biome の format + lint
bun run docs:dev          # VitePress
```

CI では `biome ci`、`typecheck`、全テスト（ブラウザを使うものは Chromium で）、`docs:build` を走らせます。

ドキュメントサイトは GitHub Actions 経由で GitHub Pages に出します。初回だけ、リポジトリの設定で **Pages → Source** を **GitHub Actions** にしてください。

## ライセンス

MIT
