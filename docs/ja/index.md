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
    details: 順序も尺も喋る言葉も、Markdown ファイルひとつが持ちます。スライドはその見出しにぶら下がる。箱を先に置くと、立派だが喋り切れない資料ができます。
  - title: 1 枚 1 HTML
    details: スライドは &lt;section class="slide"&gt; ひとつ、およそ 40 行のフラグメントです。差分が読める大きさ、エージェントが他を壊さずに直せる大きさ。
  - title: lint が通れば完成
    details: 使えるクラス、自己完結、はみ出し、コントラスト。規約は文章ではなくルールとして実装します。lint が通ることが「できた」の定義です。
  - title: USB に 1 ファイル
    details: dek build がトーク全体を HTML 1 ファイルに固めます。サーバも通信も要りません。開発サーバを使うのは、スマホをリモコンにしたいときだけ。
---

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks && bun add -d github:hajimism/dek
cd decks/2026-04-vite
$EDITOR script.md   # 喋ることを書く
bunx dek            # 開発サーバ。骨格スライドが生え、保存のたびに描画と lint
bunx dek build      # dist/2026-04-vite.html — トーク全体がこの 1 ファイル
```

`bunx dek` はプロジェクトの中で実行してください。npm の `dek` は無関係の別パッケージで、dek を入れていない場所ではそちらが動きます。

HTML はまだ一行も書いていません。それでもう発表できます。まずは[はじめる](/ja/guide/getting-started)から。台本から単一ファイルのビルドまでを通しで体験するなら[チュートリアル](/ja/guide/tutorial)へ。
