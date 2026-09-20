# スライド

目標: 1 枚を `<section class="slide">` として書き、テーマのクラスだけを使う。

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

- ルートは `<section class="slide">` ひとつ。id はファイル名から決まり、`data-slug` は build が注入する。
- 書き方は自由。終了タグを閉じても省略しても、属性に引用符を付けても付けなくても、正しい HTML5 であれば受け付ける。minify は build が一括で行う。
- レイアウトは `data-layout` で選ぶ。既定テーマは `title` / `default` / `two-col` / `full-bleed` / `quote` を持つ。`default` は上詰めで、ビートで要素が増えてもタイトルの位置が変わらない。動画にしたとき枚ごとに揺れないためのもの。
- 論理サイズは 1280 × 720 固定。表示側で `transform: scale()` してビューポートに合わせる。
- CSS はテーマのクラス語彙のみ。スライド内の `<style>` と `style=` は lint で禁止。
- 見た目の差し替えはトークンの `var()`。
- JS はスライドに置かない。動きはすべてランタイムと `theme.css` が担う。
- `lang` は `script.md` の frontmatter。殻（DOCTYPE / html / head / body）はレンダラが巻く。

確認は開発サーバと `dek check`。

```bash
dek
dek check architecture --shot
```

## 骨格

`sync` が作るのは空ファイルではない。見出しテキストを `<h2>` にし、ビートを `data-step` 付きのリストにした骨格。日本語の見出しはそのまま日本語で出る。ビートがなければ `data-layout="title"`、あれば `default`。

```html
<section class="slide" data-layout="default">
  <h2 class="slide-title">architecture</h2>
  <ul>
    <li data-step="script-parent">script.md が親</li>
    <li data-step="slides-hang">スライドがぶら下がる</li>
    <li data-step="inverted">逆だと喋れない</li>
  </ul>
</section>
```

`script.md` を書いて `dek` を叩いた時点で、同梱テーマのまま喋れる。HTML は、画面を台本以上のものにしたくなったときに書き始める。書き始めるなら、先にビートへ `{#id}` を付けて `data-step` を名前にしておくと、以降の挿入でスライドが壊れない。

既存ファイルは今までどおり触れない。ビートを足しても、すでに書いた HTML は更新されない。紐付けは `data-step` の仕事。

## 密度はテーマが決める

1 枚にどれだけ載せられるかは、`theme.css` のフォントサイズと余白が決める。文字を大きく取っておけば、詰め込んだ瞬間に枠からはみ出し、`lint --visual` が客観的に鳴る。閾値を数で決める代わりに、幾何で真偽が決まるルールに密度の管理を委ねる。詰め込みたければテーマの文字を小さくする。その一手が、意図的な設計判断として差分に残る。

## 次

段階表示と要素の移動 → [ビート](./steps)
