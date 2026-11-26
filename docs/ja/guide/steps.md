---
description: '`data-step` と `data-morph`、View Transitions、スライドスクリプト。順序は台本が、見た目は CSS が決める。'
---

# ビート

ビートは台本（`script.md`）の `###` 見出しです。画面上では要素が現れるタイミングに対応します。このページでは、HTML 側での紐づけ方、スライド間の遷移、要素を次のスライドへ引き継ぐモーフ、そして CSS だけでは書けない動きの作り方を説明します。順序は常に台本が決め、見せ方は常に CSS が決めます。

## `data-step`

`data-step` 属性で、その要素がどのビートに属するかを指定します。値にはビートの id か、「このスライドの k 番目のビート」を意味する正の整数を書きます。ランタイムの役割は単純で、あるビートに達したときに、そのビート以前へ紐づいたすべての要素に `is-shown` クラスを付与するだけです。

スライド自体は最初のビートより先に表示されるため、`data-step` を付けた要素はスライド内で 1 回送るまで見えません。最初のビートも含め、すべてのビートが同じ仕組みで自分の要素を表示します。表示・非表示の見た目はテーマ側で定義します。`is-shown` は現在表示中のスライドに付く `is-current` と同じくプレイヤーが付与する状態クラスなので、CSS セレクタで参照するだけにとどめ、HTML には直接書かないでください（`DEK010`）。

```html
<div class="col" data-step="slides-hang">…</div>
<div class="col" data-step="2">…</div>
```

指定には番号よりも id をおすすめします。セクションの途中に `###` を追加すると番号はすべてずれますが、id なら同じビートを指し続けるため、既存の HTML を触らずに済みます。同じスライド内で番号と id を混ぜて書いても、整数は位置・それ以外は id として一意に解決されます。

```css
/* theme.css */
.slide.is-current [data-step] { opacity: 0; transform: translateY(0.5em); transition: var(--step-transition); }
.slide.is-current [data-step].is-shown { opacity: 1; transform: none; }
```

フェードでもスライドインでも、CSS で書ける表現なら自由に選べます。dek 独自のアニメーション記法は持ち込みません。

同梱テーマは要素を `display: none` ではなく `opacity` と `transform` で隠します。どのビートでもレイアウトの占有領域が変わらないため、`lint --visual` のはみ出し判定がビート間でぶれません。

要素が 1 つも紐づいていないビートがあっても問題ありません（画面を動かさず喋りの間を作る用途に使えます）。番号が連番である必要もありません。エラーになるのは対応先が見つからない `data-step` だけで、[DEK003](/ja/reference/lint#dek003) として報告されます。

## View Transitions

スライド間の切り替えにはブラウザの View Transitions API を使います。ランタイムが `document.startViewTransition()` を呼び出し、実際のアニメーションはテーマ側で定義します。

```css
/* theme.css */
::view-transition-old(slide) { animation: fade-out var(--step-transition); }
::view-transition-new(slide) { animation: fade-in var(--step-transition); }
```

遷移用の疑似要素はスライドの中ではなくページルートに属するため、そのままでは `.slide` のトークンを参照できません。そこで dek はテーマを適用する際に、`.slide` で定義されたトークンを `::view-transition` にも自動で展開します。これにより、`var(--step-transition)` はスライドと同じ値を読み取り、`@media` 内の切り替えも反映されます（`[data-layout]` の下やスライド専用 CSS に閉じたトークンは、そのスライド内でのみ有効です）。

プレイヤーがスライド領域に `slide` という名前を付けているため、アニメーションの対象はスライド本体だけです。スライド一覧や発表者ビュー、周囲の余白は動かず、端から入ってくる動きもスライドの枠内でクリッピングされます。ページ全体を表す `root` はアニメーションしません。

## `data-morph`

要素を次のスライドへ滑らかに引き継ぎたい場合は、両方のスライドの要素に同じ `data-morph` 名を付けます。

```html
<!-- problem.html -->
<img class="figure" data-morph="pipeline" src="assets/pipeline.svg">

<!-- architecture.html -->
<img class="figure figure-small" data-morph="pipeline" src="assets/pipeline.svg">
```

ランタイムが `data-morph` を `view-transition-name` に変換し、ブラウザが 2 枚のスライド間で位置とサイズを補間します。次の話題へ移るときに図が隅へ小さく退く、といった演出が属性 1 つで書け、HTML は素の `<section class="slide">` のまま保てます。

同じスライド内に同じ `data-morph` 名を重複して書いたり、`slide` のような予約名を使ったりすると [DEK005](/ja/reference/lint#dek005) エラーになります。前後どちらのスライドにも同じ名前がない場合はモーフが起きないため、[DEK028](/ja/reference/lint#dek028) の警告が出て、hint に最も近い候補が表示されます。

モーフの具合は静止画だけでは確認しにくいため、遷移を途中で止めたフレームを撮って確かめます。

```bash
dekc shot problem --to architecture --at 0.5
```

`problem` の最終ビートから `architecture` へ移る遷移の 50% 時点を静止画として `.cache/shots/problem~architecture~0.5.<hash>.png` に保存します。開始と終了は `--at 0`・`--at 1` で確認できます。ただし `--at` が対象にするのは View Transition の時間だけなので、`--at 1` の時点では新しいスライド側の入場アニメーションがまだ動いている場合があります。全体の動きを見たいときは [`--motion`](#静止画で動きを見る) を使ってください。`dekc video` の録画に使うのと同じプレイヤー文書で描画しているため、ここで確認した見え方がそのまま動画にも反映されます。

同梱テーマは `prefers-reduced-motion` を尊重し、OS 側で視差効果を減らす設定になっている場合はすべてのアニメーションを省略します。

## スクリプトで動かす

数字が回るカウンター、段階的に描かれるグラフ、canvas 描画など、CSS だけでは表現しにくい動きは、スライドの横に `slides/<id>.ts` として置きます。素の JavaScript もそのまま TypeScript として扱われるため、型注釈なしでも動きます。

```ts
// slides/growth.ts
export default {
  motion: { growth: 1200 },            // ビートごとの動きの長さ（ms）。キーはビート id・番号、表示直後は "0"
  draw(slide, { index, step, t }) {    // t: このビートに入ってからの経過時間（ms）
    const p = step === "growth" ? t / 1200 : 0;
    const bar = slide.querySelector<HTMLElement>("[data-bar]");
    if (bar) bar.style.width = `${p * 80}%`;
  },
} satisfies DekSlide;
```

要素の取得にはクラスではなく、`<div data-bar>` のような `data-*` 属性を使ってください。クラスはスタイル用の語彙なので、目印としてだけ付けた未定義クラスは `DEK010` に、また `querySelector`・`closest`・`matches`・`getElementsByClassName` でクラスを参照すると `DEK017` になります。

`DekSlide` 型は import せずに使えます。`dekc init` と `dekc sync` が型定義を `.dek/slide.d.ts` に書き出し、`dekc init` がそれを読む `tsconfig.json` も配置するため、エディタ上で `slide` が `HTMLElement`、`t` が `number` と推論され、フィールド名の誤記や `process` のような Node グローバルの使用を編集時点で検出できます。既存の `tsconfig.json` がある場合は `sync` が上書きしないため、`include` に `".dek/*.d.ts"` を手動で追加してください。なお dek はビルド時に型を落とすだけで `tsc` 自体は実行せず、実行時に影響する誤りを lint で検査します。

`draw` は経過時間 `t` の関数として書き、時計の管理はランタイムに任せます。

- 前へ 1 ステップ進んだときは、アニメーションフレームごとに `t` を `0` からそのビートの `motion` まで進めます。
- ジャンプ・戻る操作・`prefers-reduced-motion`・スライド一覧・発表者ビューの次プレビュー・`dekc shot`・`lint --visual`・PDF では、最終状態で 1 回だけ描画します。
- `dekc video` では Web Animations と同期させながら `t` を 1 フレームずつシークし、ビートの残り時間は最終フレームで止めます。
- `motion` に載っていないビートでは `t = 0` で 1 回だけ描画します。

スライド一覧や次プレビュー用の複製も含め、要素が DOM に配置されてから `draw` が呼ばれるため、`draw` の中で寸法を測っても構いません。その際は `transform` の拡大縮小に影響されない `offsetWidth` などのレイアウト寸法を使ってください（`getBoundingClientRect` はウィンドウサイズによって値が変わります）。

以上の仕組み上、描画内容は `t` だけから決まるようにし、操作する要素は毎回すべて上書きしてください。ジャンプや戻る操作では遷移先の最終状態だけを直接描くため、同じ `(index, t)` なら直前の状態にかかわらず同じ見た目になる必要があります。タイマー・`requestAnimationFrame`・呼び出しをまたぐ状態を使うと、実時間で待たずにフレームを書き出す動画生成が正しく動きません。`setTimeout`・`requestAnimationFrame`・`Date`・`performance.now`・`Math.random` の使用は lint が行番号付きで `DEK017` として報告します。

スクリプト自体は 1 ファイルで自己完結させます。`export default` のみを持ち、import は禁止、トップレベルは定義だけにとどめ、DOM 操作は `draw` の中だけで済ませてください。これに反するコードや、存在しないビートをキーにした `motion`、`.ts` ではなく `.js` で置かれたファイルはいずれも `DEK016` になります。lint は Node・Bun グローバルのない別ワーカーでトップレベルを評価し、1 秒でタイムアウトさせます（誤ったコードが dek 本体に影響しないための措置であり、セキュリティサンドボックスではありません）。`dekc build` はスクリプトをインライン化し、`dekc mv` は HTML と一緒にリネームし、開発サーバーでは保存時にページをリロードします。

## 静止画に写るもの

アニメーションを再生しない場面（`dekc shot`、`lint --visual`、PDF、`dekc shot <a> --to <b>` で切り替わる直前のスライド）では、すべてそのビートの完了状態を描画します。スライドスクリプトは動きの最終時点で実行され、CSS のアニメーションやトランジションも完了位置まで進めます。そのため、入場アニメーションの途中ではなく落ち着いた先の状態で計測・撮影されます。

`animation-iteration-count: infinite` のような無限ループのアニメーションには終わりがないため、静止画では最初のフレームで止めます（同じビートなら何度撮っても同じ結果になります）。プレイヤーは終わりを待たずに進み、`dekc video` はビート再生中は繰り返しを録画してその後最初のフレームで止めます。配布資料や静止画で見せたい姿が最初のフレームに来るよう組んでください。

`dekc shot --sheet` を実行すると全スライドの静止画を 1 枚のコンタクトシートに並べられ、デッキ全体のバランスをひと目で確認できます。

## 静止画で動きを見る

```bash
dekc shot timing --motion
```

対象スライドの表示直後と各ビートを 1 行ずつ並べたシートを作ります。各行は実際の発表と同じ順序で再生します（表示直後は前のスライドから、各ビートは直前の位置から）。その遷移で始まったすべての動き（View Transition、CSS アニメーション・トランジション、スライドスクリプト）を全体の 0・25・50・75% の時点で止め、最後を完了状態のフレームにします。したがって各行の最後のコマは通常の `dekc shot` と同じ画像になります。動きがないビートは完了フレームだけになり、`no motion` と付記されます。対象はその移動で始まった動きだけなので、前のビートで終わっていた入場アニメーションは終わったままです。

生成されるシートはエージェントが縮小せずに読める解像度に収まります。`--json` を付けると各コマのファイルパスと経過ミリ秒も返るため、細部の確認に使えます。特定のビートだけ確認したいときは `--step` を付けてください（`--step 0` がスライド表示直後です）。

## 次

色・書体・余白を 1 ファイルで管理する → [テーマ](./theme)
