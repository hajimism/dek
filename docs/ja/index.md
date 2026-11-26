---
layout: home
hero:
  name: dek
  text: 発表のビルドシステム
  tagline: 喋ることを書けば、あとは dek が組み立て、測り、届ける。
  actions:
    - theme: brand
      text: はじめる
      link: /ja/guide/getting-started
    - theme: alt
      text: 設計思想
      link: /ja/guide/why
    - theme: alt
      text: サンプル
      link: /ja/samples
    - theme: alt
      text: GitHub
      link: https://github.com/hajimism/dek
features:
  - title: 台本が親
    details: 順序も尺も喋る言葉も、1 つの Markdown ファイルに集約します。スライドはその見出しに紐づきます。空のスライドから埋め始めると、立派でも喋り切れない資料になりがちです。
  - title: 1 枚 1 HTML
    details: スライドは &lt;section class="slide"&gt; ひとつ、約 40 行の小さな HTML ファイルです。差分が読みやすく、エージェントも他のスライドを壊さずに編集できます。
  - title: lint が測り、あなたが決める
    details: 使えるクラス、自己完結、はみ出し、コントラスト。規約はドキュメントに書くだけでなく lint ルールとして検査します。lint が通れば機械的に検出できる問題はなく、残りは人間が判断します。
  - title: USB に 1 ファイル
    details: dekc build がトーク全体を 1 つの HTML ファイルにまとめます。サーバーもネットワークも不要です。開発サーバーを使うのは、スマホをリモコンにしたいときだけです。
---

```bash
bunx @hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks/decks/2026-04-vite
$EDITOR script.md   # 喋ることを書く
bunx dekc           # 開発サーバーを起動。骨格スライドが生成され、保存のたびに再描画と lint
bunx dekc build     # dist/2026-04-vite.html — トーク全体がこの 1 ファイル
```

コマンドは `dek` ではなく `dekc` です。npm の `dek` は無関係の別パッケージなので、`bunx dekc` はプロジェクトの中で実行してください。

HTML はまだ一行も書いていませんが、これだけで発表できます。まずは[はじめる](/ja/guide/getting-started)から進めてください。台本から単一ファイルのビルドまでを通しで体験したい場合は[チュートリアル](/ja/guide/tutorial)へどうぞ。
