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

- **ルートはひとつ。** ファイルは `<section class="slide">` のフラグメントです。ひとつもなければ何も描かれず（`DEK007`）、2 つ目以降は捨てられます（`DEK009`）。id はファイル名から決まり、`data-slug` は `dek build` が注入します。自分で書く場合はセクション id と一致させてください（`DEK006`）。
- **書き方は自由。** 終了タグを閉じても省いても、属性を引用符で囲んでも囲まなくても、正しい HTML5 なら受け付けます。`<html>` と `<body>` で包んだ完全な文書でも構いません。minify はビルド時に一括で行います。
- **レイアウトは `data-layout` で選ぶ。** 同梱テーマには `title`、`default`、`two-col`、`full-bleed`、`quote` があります。テーマにもそのスライドの CSS にも定義のないレイアウトは `DEK019` です。`default` は上詰めなので、ビートで要素が増えても見出しの位置が動きません。動画にしたときに枚ごとに揺れないためです。
- **キャンバスは 1280 × 720。** `4:3` のデッキは 1024 × 768 です。プレイヤーがスライド全体を `transform: scale()` でビューポートに合わせます。
- **クラスはテーマのものか、その枚のものだけ。** テーマにも、その枚の `slides/<id>.css` にもないクラスは `DEK010`。スライド内の `<style>`、`style=` 属性、`<script>`、`onclick=` などのイベントハンドラ、`javascript:` URL は `DEK011` です。
- **見た目はトークンで変える。** 色、書体、余白、動きは、テーマかその枚のスタイルシートの `var(--*)` から取ります。生の値は書きません。
- **スクリプトはスライドの横に置く。中には書かない。** CSS で表せない動きは `slides/<id>.ts` に書きます。[スクリプトで動かす](./steps#スクリプトで動かす)を参照してください。
- **デッキの中で完結する。** 画像は `assets/name.png` の形で参照し、`../` は使いません。リモート URL は `DEK020`、存在しないファイルは `DEK021`、デッキの外に出るパスは `DEK022`、`assets/` で始まらないローカルのファイルは `DEK023` です。`srcset`、`poster`、`<video>`・`<audio>`・`<source>`・`<track>`・`<iframe>` の参照先も `<img src>` と同じように検査します。

文書の殻、台本の frontmatter から来る `lang` 属性、プレイヤーはレンダラが付け足します。確認は開発サーバか、次の一手で:

```bash
dek check architecture --shot
```

## 骨格

`dek sync` と、保存のたびに動く開発サーバは、HTML のないセクションに骨格を生成します。骨格は空ファイルではありません。見出しの文言を `<h2>` に入れ、ビートを `data-step` で結んだリストにしたものです。

```html
<section class="slide" data-layout="default">
  <h2 class="slide-title"></h2>
  <ul>
    <li data-step="script-parent">script.md が親</li>
    <li data-step="slides-hang">スライドがぶら下がる</li>
    <li data-step="3">id のないビート</li>
  </ul>
</section>
```

ビートのないセクションは `data-layout="title"`、あれば `default` です。id のあるビートは id で、ないビートは 1 始まりの位置で結ばれます。

`## recap` のように id だけの見出しには表示する文言がないので、骨格の `<h2>` は空です。例外は先頭のセクションで、デッキの `title` が入ります。英語のスラッグが投影されるスライドに紛れ込む事故を防ぐためです。空の見出しは lint が `DEK024` で警告します。文言を出したいなら `## まとめ {#recap}` と書いてください。

sync は、あなたが手を入れたスライドには一切触れません。台本にビートを足しても、すでに書いた HTML は更新されません。紐付けは `data-step` の仕事です。骨格はビートの id を使うので、HTML を手で書き始める前にビートへ `{#id}` を付けておけば、あとからの挿入でスライドが壊れることはありません。id のあるビートを手書きの数字で指すと `DEK025` の警告になり、hint がその id を示します。

まだ誰も手を入れていない骨格は別です。それは sync が書いたままのファイルなので、台本が変われば sync が書き直します。デッキの `title` を変えたりビートを足したりすると、手つかずの骨格はそれに追従します。ファイルに一度でも手を入れれば、それ以降は書き直しません。`dek sync` はこうしたファイルを `(updated)` として表示します。

## スライドごとの CSS

1 枚でしか使わない装飾は、共有の語彙に入れません。HTML の横の `slides/<id>.css` に置きます。

```css
/* slides/usb.css */
.usb-mark { color: var(--accent); }
.slide.is-current .usb-mark { animation: pop var(--step-transition); }
@keyframes pop { from { transform: scale(0.9); } }
```

レンダラは、すべてのルールをその枚だけに効くように書き換えます。`.usb-mark` は `.slide:where([data-slug="usb"]) .usb-mark` に、先頭の `.slide` は `.slide:where([data-slug="usb"])` になります。`pop` も改名されるので、別の枚の `pop` とは衝突しません。スコープが足す詳細度は `.slide` ひとつ分だけなので、ここに書いたルールは `theme.css` の末尾に書いたのと同じ強さで効きます。テーマの `.slide .x` には勝ち、レイアウトの `.slide[data-layout="split"] .x` やビートの状態 `.slide.is-current [data-step]` のような、より詳細なテーマのルールには負けます。それらを上書きしたいときは、同じセレクタをここに書いてください。

テーマと同じ規則も適用されます。値はトークンから取り（`DEK014`）、新しいトークンを自分で定義しても構いません。ここで定義したクラスは、この枚でだけ定義済みとみなされ（`DEK010`）、`max_classes` には数えません（`DEK013`）。スライドの外まで届くルールは `theme.css` に置きます（`DEK012`）。`::view-transition-*`、`@font-face`、`@import`、それにスライドの中では決して当たらない `:root`・`html`・`body` です。`url()` はスライドの HTML と同じ規則に従い、デッキからの相対で `assets/...` と書き、リモートは使えません（`DEK020`、`DEK023`）。`dek mv` はスタイルシートも HTML と一緒に動かします。対応するセクションのないスタイルシートは `DEK002` です。同じクラスが何枚にも出てきたら、`theme.css` に移してください。

## 密度はテーマが決める

1 枚にどれだけ載せられるかは、`theme.css` のフォントサイズと余白が決めます。字数の上限のようなルールはありません。文字を大きく取っておけば、詰め込んだ瞬間にキャンバスからはみ出し、`dek lint --visual` がそれを測って `DEK030` として報告します。判定は幾何から来るので、好みの問題になりません。もっと詰めたいなら、テーマの文字を小さくしてください。その判断は差分に残り、レビューできます。

## 次

喋りに合わせて要素を現し、要素を次の枚へ連れていく → [ビート](./steps)
