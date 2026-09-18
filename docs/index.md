---
layout: home
hero:
  name: dek
  text: 台本から組み立てる HTML スライド
  tagline: Talk-script-first HTML slides.
  actions:
    - theme: brand
      text: はじめる
      link: /guide/getting-started
    - theme: alt
      text: なぜ dek か
      link: /guide/why
    - theme: alt
      text: GitHub
      link: https://github.com/hajimism/dek
features:
  - title: 台本が親
    details: 順序と尺と喋りは script.md だけが持つ。スライドはそこから生える。箱を先に置くと、立派だが喋れない資料になる。
  - title: 1 枚 1 HTML
    details: 各スライドは単体で開く完結したドキュメント。編集対象は 40 行。壊れてもその 1 枚で済む。
  - title: lint が完成
    details: 使えるクラス、自己完結、はみ出し、コントラスト。規約はドキュメントではなくルール。通ることが完成の定義。
  - title: USB 1 ファイル
    details: dek build が会場 HTML を 1 つに固める。サーバもネットワークも要らない。スマホが要るときだけ --remote。
---

```bash
bunx github:hajimism/dek init my-talks --deck 2026-04-vite
cd my-talks
bun add github:hajimism/dek
cd decks/2026-04-vite
$EDITOR script.md
bunx dek
bunx dek build
```

HTML はまだ書かない。[はじめる](/guide/getting-started) で骨格のまま喋れるところまで行く。
