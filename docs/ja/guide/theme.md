# テーマ

デッキの見た目を決めるのは `theme.css` です。スライドは構造とクラス名を、テーマは共有の見た目を受け持ち、その枚でしか使わない装飾はその枚の `slides/<id>.css` が足します。このページでは、トークンの契約、語彙の増やし方、そしてデッキごとにコピーを持つ理由を扱います。

## 13 のトークン

クラス名が HTML とテーマの契約なら、カスタムプロパティは見た目を差し替えるための仕組みです。すべてのテーマは次の 13 個を `.slide` に公開します。`:root` ではなく `.slide` に置くのは、発表者ビューの UI へ漏れないようにするためで、トップレベルセレクタを禁じる `DEK012` と同じ理由です。View Transition はどのスライドの外にもあるので、dek は `.slide` のトークンをそこにも渡します。[View Transitions](./steps#view-transitions) を参照してください。

| トークン | 役割 |
| --- | --- |
| `--fg` `--bg` `--accent` `--muted` | 色 |
| `--font-title` `--font-body` | 書体 |
| `--size-title` `--size-body` `--size-caption` | 字の大きさ |
| `--gap` `--pad` | 余白 |
| `--radius` | 角丸 |
| `--step-transition` | 動き |

色のトークンはどれも文字に使う前提です。同梱テーマでは `--fg`、`--muted`、`--accent` のいずれも `--bg` に対して 4.5:1 に達するので、本文に使っても `DEK031` を通ります。値を変えるときもこれを保ってください。

生の色、`font-family` の値、絶対単位を書けるのは `--*` プロパティへの代入のときだけです。それ以外の場所では `var()` か `calc(var() …)` を使います。単位なしの `0`、`thin`、`em` は許されます。`var(--fg, #fff)` のような生のフォールバック付き `var()` は生の値として数えます。トークンが欠けていれば `DEK015`、トークンの外に生の値があれば `DEK014` です。デッキ固有のトークンはいくつ足しても構いません。

すべてのセレクタは `.slide` の下に置きます。例外は `::view-transition-*` 疑似要素と、`@keyframes` や `@media` のような at-rule だけです。

## 語彙を増やす

テーマに定義のないクラスは `DEK010` です。解消するには `theme.css` にそのクラスを足します。これは意図した設計です。語彙を増やすのは設計判断であって、lint が禁じるべきものではありません。lint の仕事は、その判断に「意図的な一手」というひと手間をかけさせ、レビューできる差分として残すことです。`DEK013` はクラスの総数に上限（既定 40）を置き、その一手が無限に繰り返されないようにします。

新しいクラスはデッキ自身の `theme.css` に入るので、他のデッキには影響しません。定着したクラスは `cp` でプロジェクトのテーマに引き上げます。

すべてのクラスにその一手が要るわけではありません。1 枚でしか使わない装飾は、その枚のスタイルシートに置きます。そこなら `DEK013` にも数えられず、他の枚にも漏れません。[スライドごとの CSS](./slides#スライドごとの-css)を参照してください。

## レイアウトの HTML 例

レイアウトは、どんなマークアップを受け取るかの約束です。`split` は親のノードと 2 つの結果を、`tree` は親と子の並びを想定しています。その約束を、レイアウトの最初の規則のすぐ上にコメントとして書いておくと、テーマと一緒に受け継がれます。

```css
/* @layout split
<section class="slide" data-layout="split">
  <h2 class="slide-title">One source, two results</h2>
  <p class="node node-parent">Source</p>
  <p class="node" data-step="1">Result</p>
  <p class="node" data-step="2">Result</p>
</section>
*/
.slide[data-layout="split"] {
```

`dekc theme split` でこの例を出力でき、`dekc theme` でどのレイアウトに例があるかを一覧できます。同梱テーマと sample のテーマは全レイアウトに例を持っているので、エージェントは推測せずに、そのレイアウトが想定するマークアップからスライドを書き始められます。

## スライド番号

どのスライドにも、`script.md` での位置が付いています。`--dek-slide-number` は 1 から数えた番号、`--dek-slide-count` はデッキの枚数です。build、dev サーバー、スクショ、PDF のどれでも同じように付くので、これを使って刷ったノンブルは、スライドを足しても消しても、`dekc mv` で動かしても台本の順序どおりに変わります。スライドの HTML に番号は書きません。

CSS カウンターに渡せば、どのカウンタースタイルでも刷れます。

```css
.slide {
  counter-reset: folio var(--dek-slide-number) folios var(--dek-slide-count);
}

.slide::after {
  content: counter(folio, decimal-leading-zero) " / " counter(folios);
}
```

どのスライドにノンブルを出すかは、本と同じくテーマが決めます。表紙で隠すなら `.slide[data-layout="cover"]::after { content: none; }` と書きます。隠しても、表紙は 1 枚目として数えられます。

## コピーして、固定する

プロジェクト直下の `theme.css` は新しいデッキの出発点です。編集は一方向にしか流れません。作成時に新しいデッキへ下り、残す価値があると判断したときに手で上げます。

```bash
dekc new 2026-09-dek
dekc new 2026-09-dek --theme-from 2026-04-vite
cp decks/2026-09-dek/theme.css theme.css
```

理由は[プロジェクトとデッキ](./structure#テーマは共有せず、コピーする)にあります。

## 次

規約を、忘れられないループにする → [Lint](./lint)
