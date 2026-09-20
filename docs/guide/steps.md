# ビート

目標: 台本のビートを画面の段階表示に結びつける。順序は台本、見た目は CSS。

## `data-step`

`data-step` はビートの id を指す。値が正の整数のときだけ「その枚の k 番目」の省略形。ランタイムがやるのは、現在のビートまでに当たる要素へ `is-shown` を付けることだけ。どう現れるかは `theme.css` が決める。

```html
<div class="col" data-step="slides-hang">…</div>
<div class="col" data-step="2">…</div>
```

途中に `###` を足すと番号はすべてズレる。id で指していれば、足したビートに要素を付けるまで既存の HTML は壊れない。番号と id が同じ枚に混ざっても、整数は番号・それ以外は id、と一意に解ける。

```css
/* theme.css */
.slide [data-step] { opacity: 0; transform: translateY(0.5em); transition: var(--step-transition); }
.slide [data-step].is-shown { opacity: 1; transform: none; }
```

フェードでもスライドインでも、テーマを書く人の判断。アニメーションの記法は CSS そのもので、dek が語彙を足すことはない。

既定テーマは `opacity` と `transform` で隠す。`display: none` を使わないのは、レイアウトがステップによって動かないようにするため。これで `lint --visual` のはみ出し判定がどのステップでも同じ結果になる。

ビートに要素が無いのは構わない。喋りだけの区切りとして使える。番号が 1 から連続している必要もない。解決できない参照だけが [DEK003](/reference/lint#dek003) になる。

## View Transitions

スライド間の遷移はブラウザ標準の View Transitions API を使う。ランタイムは `document.startViewTransition()` を呼ぶだけで、動きはテーマが書く。

```css
/* theme.css */
::view-transition-old(root) { animation: fade-out var(--step-transition); }
::view-transition-new(root) { animation: fade-in var(--step-transition); }
```

## `data-morph`

要素を次の枚へ連れていく。

```html
<!-- problem.html -->
<img class="figure" data-morph="pipeline" src="assets/pipeline.svg">

<!-- architecture.html -->
<img class="figure figure-small" data-morph="pipeline" src="assets/pipeline.svg">
```

ランタイムが `data-morph` を `view-transition-name` に変換し、ブラウザが 2 枚の間で位置とサイズを補間する。図が右上に小さく退いて次の話が始まる、という表現が属性 1 つで書け、スライドは `<section class="slide">` フラグメントのまま。

同一スライド内で `data-morph` の名前が重複すると [DEK005](/reference/lint#dek005)。

補間の途中は静止画では見えない。採否を目で決めるときは、遷移を途中で止めて撮る。

```bash
dek shot problem --to architecture --at 0.5
```

`problem` の最終ビートから `architecture` の先頭へ移る View Transition を 50% で止めた 1 フレームが `.cache/shots/` に書かれる。`--at 0` と `--at 1` で両端も撮れる。動画と同じプレイヤー文書で撮るので、`dek video` に写るものと一致する。

既定テーマは `prefers-reduced-motion` を尊重し、指定があればすべての動きを省く。

## 次

色と字と余白をテーマで決める → [テーマ](./theme)
