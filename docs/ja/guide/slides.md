# スライド

スライドは `slides/` の中の 1 ファイルです。名前はセクションの id、ルート要素は `<section class="slide">` ひとつ。スタイルはテーマが定義するクラスだけで付けます。

```html
<section class="slide" data-layout="two-col">
  <h2 class="slide-title">script.md が親</h2>
  <div class="col">
    <p class="node">script.md</p>
    <p class="node node-parent" data-step="script-parent">script.md ← 親</p>
  </div>
  <div class="col" data-step="slides-hang">
    <p class="node">intro.html</p>
    <p class="node">architecture.html</p>
  </div>
</section>
```

## ルール

- **ルートはひとつ。** ファイルは `<section class="slide">` のフラグメントです。id はファイル名から決まり、`data-slug` は `dek build` が注入します。自分で書く場合はセクション id と一致させてください（`DEK006`）。
- **書き方は自由。** 終了タグを閉じても省いても、属性を引用符で囲んでも囲まなくても、正しい HTML5 なら受け付けます。`<html>` と `<body>` で包んだ完全な文書でも構いません。minify はビルド時に一括で行います。
- **レイアウトは `data-layout` で選ぶ。** 同梱テーマには `title`、`default`、`two-col`、`full-bleed`、`quote` があります。`default` は上詰めなので、ビートで要素が増えても見出しの位置が動きません。動画にしたときに枚ごとに揺れないためです。
- **キャンバスは 1280 × 720。** `4:3` のデッキは 1024 × 768 です。プレイヤーがスライド全体を `transform: scale()` でビューポートに合わせます。
- **クラスはテーマのものだけ。** テーマにないクラスは `DEK010`。スライド内の `<style>`、`style=` 属性、`<script>` は `DEK011` です。
- **見た目はトークンで変える。** 色、書体、余白、動きはテーマの `var(--*)` から来ます。スライドには書きません。
- **JavaScript は書かない。** 動きとインタラクションはランタイムと `theme.css` の仕事です。
- **デッキの中で完結する。** 画像は `assets/name.png` の形で参照し、`../` は使いません。リモート URL は `DEK020`、存在しないファイルは `DEK021`、デッキの外に出るパスは `DEK022`、`assets/` で始まらないローカルの `src` は `DEK023` です。

文書の殻、台本の frontmatter から来る `lang` 属性、プレイヤーはレンダラが付け足します。確認は開発サーバか、次の一手で:

```bash
dek check architecture --shot
```

## 骨格

`dek sync` と、保存のたびに動く開発サーバは、HTML のないセクションに骨格を生成します。骨格は空ファイルではありません。見出しの文言を `<h2>` に入れ、ビートを `data-step` で結んだリストにしたものです。

```html
<section class="slide" data-layout="default">
  <h2 class="slide-title">architecture</h2>
  <ul>
    <li data-step="script-parent">script.md が親</li>
    <li data-step="slides-hang">スライドがぶら下がる</li>
    <li data-step="3">id のないビート</li>
  </ul>
</section>
```

ビートのないセクションは `data-layout="title"`、あれば `default` です。id のあるビートは id で、ないビートは 1 始まりの位置で結ばれます。

`## recap` のように id だけの見出しには表示する文言がないので、骨格の `<h2>` は空です。例外は先頭のセクションで、デッキの `title` が入ります。英語のスラッグが投影されるスライドに紛れ込む事故を防ぐためです。文言を出したいなら `## まとめ {#recap}` と書いてください。

sync は既存ファイルに一切触れません。台本にビートを足しても、すでに書いた HTML は更新されません。紐付けは `data-step` の仕事です。骨格はビートの id を使うので、HTML を手で書き始める前にビートへ `{#id}` を付けておけば、あとからの挿入でスライドが壊れることはありません。

## 密度はテーマが決める

1 枚にどれだけ載せられるかは、`theme.css` のフォントサイズと余白が決めます。字数の上限のようなルールはありません。文字を大きく取っておけば、詰め込んだ瞬間にキャンバスからはみ出し、`dek lint --visual` がそれを測って `DEK030` として報告します。判定は幾何から来るので、好みの問題になりません。もっと詰めたいなら、テーマの文字を小さくしてください。その判断は差分に残り、レビューできます。

## 次

喋りに合わせて要素を現し、要素を次の枚へ連れていく → [ビート](./steps)
