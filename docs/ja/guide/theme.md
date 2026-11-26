---
description: '`.slide` に定義する 13 のトークン。クラス語彙の増やし方、レイアウト例、ノンブル、日本語の改行制御。'
---

# テーマ

デッキの見た目を司るのが `theme.css` です。HTML が構造とクラス名を、テーマが共通のデザインを受け持ち、1 枚のスライドだけで使う装飾はそのスライド専用の `slides/<id>.css` に分けます。このページでは、トークンの規約、クラスの増やし方、そしてテーマをデッキごとにコピーする理由を説明します。

## 13 のトークン

クラス名が HTML とテーマの契約なら、CSS カスタムプロパティは見た目を差し替えるためのインターフェースです。すべてのテーマは、次の 13 個のトークンを `.slide` に定義します。`:root` ではなく `.slide` に置くのは発表者ビューの UI へ影響が漏れないようにするためで、トップレベルセレクタを禁じる `DEK012` と同じ理由です。View Transition はスライドの外に属するため、dek が `.slide` のトークンを自動で引き継ぎます（[View Transitions](./steps#view-transitions) を参照）。

| トークン | 役割 |
| --- | --- |
| `--fg` `--bg` `--accent` `--muted` | 色 |
| `--font-title` `--font-body` | 書体 |
| `--size-title` `--size-body` `--size-caption` | 文字サイズ |
| `--gap` `--pad` | 余白 |
| `--radius` | 角丸 |
| `--step-transition` | 動き |

色のトークンはいずれも文字に使う前提で設計されています。同梱テーマでは `--fg`・`--muted`・`--accent` のすべてが `--bg` に対してコントラスト比 4.5:1 以上を満たしており、本文に使っても `DEK031` を通ります。配色を変えるときもこの基準を保ってください。

生の色、`font-family` の値、絶対単位を書けるのは `--*` カスタムプロパティへの代入時だけです。それ以外の場所では `var()` か `calc(var() …)` を経由します。単位なしの `0`、`thin`、`em` などは許容されますが、`var(--fg, #fff)` のように生のフォールバックを書いた `var()` は生の値とみなされます。必須トークンが欠けると `DEK015`、トークン定義の外に生の値があると `DEK014` エラーになります。デッキ独自のトークンはいくつ足しても構いません。

すべてのセレクタは `.slide` の配下に置きます。例外は `::view-transition-*` 疑似要素と、`@keyframes`・`@media` などの at-rule だけです。

## 語彙を増やす

テーマに定義のないクラスを使うと `DEK010` エラーになります。解消するには `theme.css` にそのクラスを定義します。語彙を増やすこと自体は設計上の判断であり、lint が禁じるべきではありません。lint の役割は、無意識にクラスを増殖させるのではなく「意図的な一手」として `theme.css` に残させ、レビュー可能な差分にすることです。さらに `DEK013` がクラス総数の上限（既定 40）を設け、際限なく増え続けるのを防ぎます。

追加したクラスはそのデッキ専用の `theme.css` に入るため、他のデッキには影響しません。定番化したクラスは `cp` でプロジェクト直下の `theme.css` へ引き上げてください。

1 枚のスライドだけで使う装飾までテーマに入れる必要はありません。`slides/<id>.css` に置けば `DEK013` の上限にも数えられず、他のスライドにも影響しません（[スライドごとの CSS](./slides#スライドごとの-css)を参照）。

## レイアウトの HTML 例

レイアウトとは「どんな HTML 構造を想定しているか」という約束です。たとえば `split` は親ノードと 2 つの結果を、`tree` は親と子の並びを前提にしています。各レイアウトの最初のルールの直上にコメントで HTML 例を書いておくと、テーマと一緒にそのまま引き継がれます。

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

`dekc theme split` でこの HTML 例を取り出せ、`dekc theme` でどのレイアウトに例が書かれているかを一覧できます。同梱テーマと sample のテーマには全レイアウトの例が入っているため、エージェントも推測に頼らず、想定されたマークアップから書き始められます。

## スライド番号

各スライドには、`script.md` 上の順番に応じたカスタムプロパティが自動で渡されます。`--dek-slide-number` が 1 始まりの現在番号、`--dek-slide-count` が総枚数です。ビルド・開発サーバー・スクリーンショット・PDF のすべてで同じ値が入るため、これを使って表示したページ番号（ノンブル）は、スライドの増減や `dekc mv` での並べ替えに自動で追従します。スライドの HTML 側に番号を直書きする必要はありません。

CSS カウンターに渡せば、好みのカウンタースタイルで表示できます。

```css
.slide {
  counter-reset: folio var(--dek-slide-number) folios var(--dek-slide-count);
}

.slide::after {
  content: counter(folio, decimal-leading-zero) " / " counter(folios);
}
```

どのスライドにページ番号を出すかは、書籍と同じくテーマで決めます。表紙だけ隠したい場合は `.slide[data-layout="cover"]::after { content: none; }` のように書きます。非表示にしても、表紙は 1 枚目として数えられます。

## 改行

行の折り返し位置はブラウザが幅を使い切ったところで決まるため、台本にもスライドの HTML にも現れません。同梱テーマでは、読みやすい区切りで折り返されるよう次の指定を入れています。

```css
.slide {
  word-break: auto-phrase;
  text-wrap: pretty;
}

.slide .slide-title {
  text-wrap: balance;
}
```

`word-break: auto-phrase` は日本語を機械的な文字単位ではなく文節単位で折り返します。有効になるのはデッキの `lang` が `ja` のときで、frontmatter で省略しても台本の内容から自動判定されます。`text-wrap: pretty` は段落の最終行にわずかな文字だけが残るのを防ぎ、`text-wrap: balance` は見出しの各行の長さを均等に近づけます。スクリーンショット・PDF・PPTX・動画はいずれも Chromium で描画するため、すべて同じ位置で折り返されます。

一方、ビルドした HTML や開発サーバーの画面は閲覧者のブラウザで開かれます。Safari と Firefox は `auto-phrase` に未対応のため、日本語のデッキでは `dekc build` と開発サーバーが [BudouX](https://github.com/google/budoux) で文節境界を計算し、`auto-phrase` 非対応のブラウザでのみプレイヤーが文節の区切りに `<wbr>` を挿入します。同時にデッキ CSS 内の `word-break: auto-phrase` の直前に `word-break: keep-all` を補い、非対応ブラウザがそちらを使うようにします。Chromium での見た目は変わらず、Safari や Firefox でも文節単位で折り返されるようになります（ただし文節の区切り方は Chromium と完全に一致するとは限りません。スクリーンショットに写るのは Chromium の描画結果です）。

テーマはデッキごとにコピーを持つため、この対応以前に作ったデッキは `theme.css` へ上の記述を足すまで従来の折り返しのままです。`dekc lint --visual` は文節の途中で切れる行や末尾が極端に短い段落を [`DEK035`](/ja/reference/lint#dek035) として警告します。上の指定を入れた後は、文節折り返しの基準と一致するため `DEK035` の文節途切れは報告されなくなります。それでも助詞から始まる行など読みにくい折り返しが残る場合は、Chromium の文節区切りによるものか 1 行に収まらない長い文節なので、`dekc shot` で確認し、必要ならスライド側に `<br>` を入れて調整してください。

## コピーして、固定する

プロジェクト直下の `theme.css` は新しいデッキの出発点です。変更の流れは一方向で、デッキ作成時にコピーされて下り、残す価値があると判断したものだけを手動でプロジェクト直下へ引き上げます。

```bash
dekc new 2026-09-dek
dekc new 2026-09-dek --theme-from 2026-04-vite
dekc new 2026-09-dek --theme-from hajimism/dek/why-dek
cp decks/2026-09-dek/theme.css theme.css
```

`--theme-from` には ref も指定できます。別プロジェクトのテーマをベースにして、そのレイアウト上でデッキを組み立てたいときに便利です（[プロジェクトとデッキ](./structure)を参照）。

テーマを共有せずコピーする設計の理由は、[プロジェクトとデッキ](./structure#テーマは共有せず、コピーする)で説明しています。

## 次

規約を毎回自動で検証するループにする → [Lint](./lint)
