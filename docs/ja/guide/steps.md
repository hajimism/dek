# ビート

ビートは台本の `###` 見出しです。画面の上では、ビートは要素が現れる瞬間です。このページでは、その結びつきの HTML 側、スライド間の遷移、そして要素を次の枚へ連れていく方法を扱います。順序は常に台本から、見た目は常に CSS から来ます。

## `data-step`

`data-step` は、その要素がどのビートに属するかを示します。値はビートの id か、「この枚の k 番目のビート」を意味する正の整数です。ランタイムがやることはひとつだけ。あるビートに達したとき、そのビートかそれ以前に結ばれたすべての要素に `is-shown` を付けます。表示と非表示がどう見えるかはテーマが決めます。

```html
<div class="col" data-step="slides-hang">…</div>
<div class="col" data-step="2">…</div>
```

id を使うことを勧めます。セクションの途中に `###` を挿すと番号はすべてズレますが、id は同じビートを指し続けるので、新しいビートに何かを結ぶまで既存の HTML は壊れません。番号と id を同じ枚に混ぜても曖昧になりません。整数なら位置、それ以外なら id です。

```css
/* theme.css */
.slide.is-current [data-step] { opacity: 0; transform: translateY(0.5em); transition: var(--step-transition); }
.slide.is-current [data-step].is-shown { opacity: 1; transform: none; }
```

フェードでもスライドインでも、CSS で書けるものなら何でも。選ぶのはテーマを書く人です。dek は独自の語彙を足しません。

同梱テーマは要素を `display: none` ではなく `opacity` と `transform` で隠します。だからどのビートでもレイアウトが同じで、`lint --visual` はどのビートを測っても同じはみ出し判定を返します。

要素の結ばれていないビートがあっても構いません。それは喋りの間です。番号が連続している必要もありません。エラーになるのは、何にも解決できない `data-step` だけで、[DEK003](/ja/reference/lint#dek003) として報告されます。

## View Transitions

スライド間の移動にはブラウザの View Transitions API を使います。ランタイムは `document.startViewTransition()` を呼び、アニメーションはテーマが書きます。

```css
/* theme.css */
::view-transition-old(root) { animation: fade-out var(--step-transition); }
::view-transition-new(root) { animation: fade-in var(--step-transition); }
```

## `data-morph`

要素を次の枚へ連れていくには、両方の枚で同じ `data-morph` 名を付けます。

```html
<!-- problem.html -->
<img class="figure" data-morph="pipeline" src="assets/pipeline.svg">

<!-- architecture.html -->
<img class="figure figure-small" data-morph="pipeline" src="assets/pipeline.svg">
```

ランタイムが `data-morph` を `view-transition-name` に変換し、ブラウザが 2 枚の間で位置とサイズを補間します。次の話題が始まるのに合わせて図が隅へ小さく退く、という表現が属性 1 つで書け、どちらの枚も素の `<section class="slide">` フラグメントのままです。

同じ枚に同じ `data-morph` 名が 2 つあると [DEK005](/ja/reference/lint#dek005) です。

モーフは静止画では見えません。判断するには遷移を途中で止めて見ます:

```bash
dek shot problem --to architecture --at 0.5
```

`problem` の最終ビートから `architecture` へ移る遷移を 50% で止めた 1 フレームが `.cache/shots/problem-to-architecture-0.5.<hash>.png` に書かれます。両端は `--at 0` と `--at 1` で撮れます。`dek video` が録画するのと同じプレイヤー文書から撮るので、ここで見えるものが動画に映るものです。

同梱テーマは `prefers-reduced-motion` を尊重し、設定されていればすべてのアニメーションを省きます。

## スクリプトで動かす

数字が回るカウンタ、自分で描かれていくグラフ、canvas など、CSS で表せない動きは、スライドの横に `slides/<id>.ts` として置きます。素の JavaScript も TypeScript として有効なので、型を書かなくてもそのまま動きます。

```ts
// slides/growth.ts
export default {
  motion: { growth: 1200 },            // 動きの長さ（ms）。キーは data-step と同じ
  draw(slide, { index, step, t }) {    // t: このビートに入ってからの ms
    const p = step === "growth" ? t / 1200 : 0;
    const bar = slide.querySelector<HTMLElement>("[data-bar]");
    if (bar) bar.style.width = `${p * 80}%`;
  },
} satisfies DekSlide;
```

要素はクラスではなく、`<div data-bar>` のような `data-*` 属性で探します。クラスはスタイルを当てるためのものなので、目印としてだけ使ったクラスは、どこかのスタイルシートで定義するまで `DEK010` になります。

`DekSlide` は import せずに使えます。`dek init` と `dek sync` がその定義を `.dek/slide.d.ts` に書き、`dek init` はエディタがそれを読むための `tsconfig.json` も置きます。これで `slide` は `HTMLElement`、`t` は数値になり、フィールド名の打ち間違いや `process` のような Node のグローバルは書いた時点で赤線になります。`dek sync` は `tsconfig.json` を作りも書き換えもしないので、自前の `tsconfig.json` がある場合はその `include` に `".dek/*.d.ts"` を足してください。dek はビルド時に型を消すだけで `tsc` は走らせず、実行時に効く誤りは lint が検査します。

`draw` は時間の関数で、時計はランタイムが持ちます。

- 前へ 1 ステップ進むと、アニメーションフレームごとに `t` を 0 からそのビートの `motion` まで進めます。
- ジャンプ、戻る操作、`prefers-reduced-motion`、レール、発表者ビューの次のプレビュー、`dek shot`、`lint --visual`、PDF では、最終状態で 1 回だけ描きます。
- `dek video` は Web Animations と一緒に `t` を 1 フレームずつシークし、ビートの残りは最後のフレームで止めます。
- `motion` に書いていないビートは、`t = 0` で 1 回だけ描きます。

なので、描画は `t` だけから決め、触る要素は毎回すべて書き直してください。ジャンプや一歩戻る操作では新しいビートの終わりだけを描くので、同じ `(index, t)` なら直前に何を描いていても同じ見た目になる必要があります。タイマー、`requestAnimationFrame`、呼び出しをまたいで持ち越す状態は動画を壊します。録画は実時間で待たないからです。スクリプトは自己完結させます。`export default` だけを持つ 1 つのモジュールで、import はできず、トップレベルでは定義だけを行い、スライドに触るのは `draw` の中です。それ以外は `DEK016` で、スライドのビートにない `motion` のキーも `DEK016` です。lint はトップレベルを Node や Bun のグローバルがないサンドボックスで評価し、1 秒で打ち切ります。dek が読むのは `.ts` だけで、`slides/<id>.js` は名前を変えるよう `DEK016` で知らせます。`dek build` はスクリプトをインライン化し、`dek mv` は一緒に動かし、開発サーバでは保存するとページを読み直します。

## 次

色と書体と余白をひとつのファイルで → [テーマ](./theme)
