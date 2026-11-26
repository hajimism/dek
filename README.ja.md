# dek

[![npm](https://img.shields.io/npm/v/@hajimism/dek)](https://www.npmjs.com/package/@hajimism/dek) [![CI](https://github.com/hajimism/dek/actions/workflows/ci.yml/badge.svg)](https://github.com/hajimism/dek/actions/workflows/ci.yml) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/hajimism/dek/badge)](https://scorecard.dev/viewer/?uri=github.com/hajimism/dek)

**発表のためのビルドシステム。** 喋ることを書けば、あとは dek が組み立て、測り、届ける。

[ドキュメント](https://hajimism.github.io/dek/ja/) · [English README](./README.md)

dek は、コードをビルドシステムで扱うように、発表を扱うための CLI です。ソースは Markdown で書くトークの台本で、`##` の見出しひとつが 1 枚の HTML スライドになります。同じ台本から所要時間を見積もり、すべてのスライドを lint して実際の描画まで検査します。出力形式は 1 ファイルの HTML、PDF、PowerPoint ファイル、読み上げ付き動画の 4 種類です。1 つのプロジェクトに複数のデッキを収められるため、テーマや規約を過去のトークから次のトークへそのまま引き継げます。AI エージェントと一緒に作ることを、最初から前提にして設計しています。

## なぜ dek か

**スライドは喋るためにあります。** 主流のツールはどれも空のスライドから始まり、中身を埋めるほど資料は立派になる一方で、本番で喋り切るのは難しくなります。dek は反対側から始めます。何を、どの順で、どれだけの時間で喋るかを先に書き、そのうえで画面に何が出ていればいいかを決めます。台本が元になり、スライドはそこから作ります。

**トークは一度きりではありません。** dek のプロジェクトは複数のデッキをまとめて管理する場所です。規約はプロジェクト単位で持ち、見た目は前回のデッキを引き継ぎ、台本とスライドはデッキごとに分けます。

**エージェントには小さなファイルが要ります。** 1 枚のスライドは約 40 行の独立した HTML ファイルです。必要なら CSS やスクリプトも横に置けます。編集範囲が小さく差分も読みやすいため、壊れてもその 1 枚だけで済みます。

**エージェントは自分の描画結果を見られません。** dek はスライドを実際にブラウザで描画し、はみ出し・コントラスト・欠けた画像を機械可読な診断として返します。エージェントが自分の出力を検証し、自律的に修正できます。

三原則と Slidev との比較は [dek の設計思想](https://hajimism.github.io/dek/ja/guide/why.html) にまとめています。

## クイックスタート

[Bun](https://bun.sh) 1.4.3 以上が必要です。dek は Bun 専用で、Node.js では動きません。`npx` ではなく `bunx` を使ってください。

```bash
bunx @hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks/decks/2026-04-vite
```

プロジェクトを作るのは最初の一度だけです。`init` は実行中のバージョンの dek をプロジェクトの devDependencies に入れるため、以降は `bunx dekc` でその dek を動かせます。`--browser` を付けると Playwright と Chromium も一緒に入り、`--visual`・`dekc shot`・`dekc pdf` を最初から使えます。残る手順は 3 つだけで、ライブ発表ならこれで十分です。

> [!WARNING]
> パッケージ名は `@hajimism/dek`、コマンド名は `dek` ではなく `dekc` です。npm 上の `dek` は無関係の別パッケージなので、`bunx dek` を実行するとそちらがダウンロードされてしまいます。プロジェクト内では `bunx dekc`、プロジェクトの外では `bunx @hajimism/dek` を使ってください。

```bash
$EDITOR script.md   # 1. 喋ることを書く。時間をかけるのはここ
bunx dekc           # 2. 開発サーバーを起動。骨格スライドが生成され、保存のたびに再描画と lint
bunx dekc build     # 3. dist/2026-04-vite.html — トーク全体がこの 1 ファイル
```

台本を書いて `dekc` を実行するだけで、HTML を一行も書かずに同梱テーマのまま発表できます。

エージェントと一緒に作る場合は、公式スキルを `npx skills add hajimism/dek --skill dek` で入れてください。Claude Code なら `/plugin marketplace add hajimism/dek` に続けて `/plugin install dek@dek` で導入できます。`dek-design` や、編集できる PowerPoint を生成する `dek-pptx` も同じ手順で追加できます。プロジェクトの外にいるエージェントには [llms.txt](https://hajimism.github.io/dek/llms.txt) を渡してください。詳しくは [AI エージェントと作る](https://hajimism.github.io/dek/ja/guide/ai.html) を参照してください。

導入の詳細は [はじめる](https://hajimism.github.io/dek/ja/guide/getting-started.html)、通しで 1 本作ってみたい場合は [チュートリアル](https://hajimism.github.io/dek/ja/guide/tutorial.html)、コマンド一覧は [CLI リファレンス](https://hajimism.github.io/dek/ja/reference/cli.html) にあります。

## サンプル

`sample/` は Playwright・rumdl・音声合成まで組み込んだフル構成のプロジェクトで、dek 自身を題材にした 3 つのデッキを収めています。配布資料としても読める約 12 分の解説 `why-dek`、ターミナルで発表を 1 本作ってみせる 3 分のライトニングトーク `lightning`、スライド制作を AI エージェントに任せる 6 分のトーク `with-agents` です。いずれも dek.pub の [@dek](https://dek.pub/@dek) で公開しています。手順は [sample/README.ja.md](sample/README.ja.md) を参照してください。

```bash
cd sample
bun install
bun run setup          # Playwright 用の Chromium
bun run dev            # または bun run lint:visual / bun run build
```

## 開発

```bash
bun install
bunx playwright install chromium   # 最初に一度。実ブラウザを使うテストに必要
bun test --watch --timeout=20000
bun run typecheck
bun run check             # Biome の format + lint
bun run docs:dev          # VitePress
```

CI では `biome ci`、`typecheck`、`knip`、全テスト（ブラウザを使うものは Chromium で実行）、`docs:build`、`scripts/check-package.sh`（npm 公開用の tarball をインストールして動作確認）を走らせます。

ドキュメントサイトは GitHub Actions 経由で GitHub Pages にデプロイします。初回だけ、リポジトリ設定の **Pages → Source** を **GitHub Actions** に切り替えてください。

プルリクエストで必要なチェックは [CONTRIBUTING.md](./CONTRIBUTING.md)、リリースごとの変更履歴は [CHANGELOG.md](./CHANGELOG.md) にあります。脆弱性の報告は [SECURITY.md](./SECURITY.md) に従い、非公開で連絡してください。

## ライセンス

MIT。ビルドされたデッキに dek が埋め込むランタイムとテーマ（`src/runtime/` と `src/theme/`）は MIT No Attribution なので、共有するデッキに著作権表示を残す必要はありません。`apps/pub/` の dek.pub サーバーは AGPL-3.0 です。
