---
layout: home
hero:
  name: dekc
  text: 発表のビルドシステム
  tagline: 喋ることを書けば、あとは dekc が組み立て、測り、届ける。
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
      link: https://github.com/hajimism/dekc
features:
  - title: 台本が親
    details: 順序も尺も喋る言葉も、Markdown ファイルひとつが持ちます。スライドはその見出しにぶら下がる。箱を先に置くと、立派だが喋り切れない資料ができます。
  - title: 1 枚 1 HTML
    details: スライドは &lt;section class="slide"&gt; ひとつ、およそ 40 行のフラグメントです。差分が読める大きさ、エージェントがほかのスライドに影響を与えずに直せる大きさ。
  - title: lint が測り、あなたが決める
    details: 使えるクラス、自己完結、はみ出し、コントラスト。規約は文章ではなくルールとして実装します。lint が通れば測れる問題はなく、残りはあなたが判断します。
  - title: USB に 1 ファイル
    details: dekc build がトーク全体を HTML 1 ファイルにまとめます。サーバも通信も要りません。開発サーバを使うのは、スマホをリモコンにしたいときだけ。
---

```bash
bunx dekc init my-talks --deck 2026-04-vite
cd my-talks && bun add -d dekc
cd decks/2026-04-vite
$EDITOR script.md   # 喋ることを書く
bunx dekc           # 開発サーバ。骨格スライドが生え、保存のたびに描画と lint
bunx dekc build     # dist/2026-04-vite.html — トーク全体がこの 1 ファイル
```

打つのは `dek` ではなく `dekc` です。npm の `dek` は無関係の別パッケージです。

HTML はまだ一行も書いていません。それでもう発表できます。まずは[はじめる](/ja/guide/getting-started)から。台本から単一ファイルのビルドまでを通しで体験するなら[チュートリアル](/ja/guide/tutorial)へ。
