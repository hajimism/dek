# Lint

lint は、ルールで判定できることをすべて判定します。`dekc lint --visual` が通らないうちはデッキは完成していません。ただ、通っても分かるのは測れる問題がないことだけで、デッキが良いことまでは分かりません。スライドの釣り合い、話の筋、時間配分は、シートと台本を読んで判断し、最後は作者が決めます。開発サーバは保存のたびに lint を走らせるので、作業中のデッキは常に「通っている」か「なぜ通らないかが分かっている」かのどちらかです。`dekc lint` を手で叩く場面はほとんどなく、使うのは CI と、1 枚だけを確かめるときです。

```bash
dekc lint
dekc lint --fix
dekc lint --visual
dekc lint --format sarif
dekc check architecture --shot
```

`--fix` はまず sync し、HTML のないスライド（`DEKC001`）に骨格を作ります。手を入れたスライドには決して触れません。書き直したり消したりするのは、誰も編集していない骨格だけです。

## 層

一般的な Markdown の作法は [rumdl](https://github.com/rvben/rumdl) に委ね、dekc は rumdl が原理的に知りえないルールだけを書きます。rumdl は任意です。`DEKC_RUMDL` が設定されていればそれを使い、なければ `PATH`、dekc 本体がインストールされている `node_modules/.bin` の順に探し（カレントディレクトリのものは使いません。clone したリポジトリが仕込めるからです）、見つからなければ飛ばします。テキスト出力には `rumdl: skipped (rumdl is not installed)` と導入方法の `help:` 行が出て、`--json` では同じ理由と hint つきで `"skipped"` に入り、SARIF では tool execution notification になります。`dekc init` が書く `.rumdl.toml` は先頭行見出しのルールを無効にしています。台本は frontmatter と `##` で始まるからです。

| 層 | 担当 |
| --- | --- |
| Markdown の作法 | rumdl |
| スキーマ | frontmatter と設定。Zod で検証 |
| 整合性 | `script.md` ↔ `slides/*.html`、ビート ↔ `data-step` |
| テーマの契約 | 未定義クラス、インラインスタイル、トークン、スコープ、スライドごとの CSS |
| スライドスクリプト | `slides/<id>.ts` を Node と Bun から切り離して評価 |
| 自己完結 | リモート URL、欠けたファイル、デッキ外のパス |
| 描画 | はみ出しとコントラスト。ブラウザで測る |
| ナレーション | `voice/` のあるデッキだけ |
| 尺 | `duration` のあるデッキだけ |

## `--visual`

はみ出し（`DEKC030`）とコントラスト（`DEKC031`）は Playwright 経由で実際のブラウザで測ります。どちらも幾何の問題で、答えは一つに決まります。dekc はスクリーンショットを見せて「収まっていますか」と尋ねるのではなく、測ります。全スライドの全ビートを 1 回のブラウザセッションで描画し、各ページで測った結果をデッキの `.cache/visual` に残します。名前は、結果を決めるものすべてのハッシュです。テーマ、CSS、スクリプト、アセットを含む描画したページと、測るコードです。一度測ったページは測り直さないので、2 回目からの `--visual` は変えたスライドの分しか時間がかかりません。コントラストは描画されたピクセルから読むので、グラデーションや画像や光の上の文字も、聴衆に見えているとおりに判定されます。詳しくは [DEKC031](/ja/reference/lint#dekc031) を参照してください。

指摘には、直すべき要素、そのテキストの冒頭、量が入ります。

```
slides/objection.html: DEKC030 li "https://example.com/very…" overflows the right edge by 102px at steps slow, vague
  help: shorten it, or let it wrap with overflow-wrap: anywhere in slides/objection.css
slides/objection.html: DEKC031 p.note "補足" has contrast 1.5 (#333333 on #111111), below 4.5:1 at steps slow, vague
  help: theme.css alone draws it below 4.5:1: fix the pair in theme.css, where one change reaches every slide that uses it
```

下にはみ出したリストは、項目ごとではなくリスト 1 件として報告します。子は、親が収まっている辺についてだけ報告されるからです。複数のビートで同じ指摘は 1 件にまとめ、該当するビートを並べます。URL のように折り返せない文字列は、箱が収まっていてもはみ出しとして数えます。

コントラストの閾値は WCAG AA に従います。本文は 4.5:1。大きな文字、つまり 24px 以上か、18.66px 以上の太字は 3:1。だから、淡い色の大きな数字は通り、同じ色の本文は落ちます。

`--visual` を付けなければ、`dekc lint` はそのことを伝えます。`"skipped"` に `visual` が入り、テキスト出力の最後に、測るためのコマンドと一緒に `visual: skipped` が出ます。測っていないきれいな結果を、測った結果と取り違えることはありません。Playwright がなければ、それを必要とするコマンドだけがインストール手順の hint 付きで失敗します。CLI の他の部分は動きます。

- `dekc lint --visual` は判定です。診断を返し（`--format sarif` なら SARIF）、エージェントが自分の出力を確かめる主な手段になります。
- `dekc shot` は判定ではなく観察です。スライドが良く見えるかどうかは、人間の判断に残します。

## 声を足しても、失敗の意味は変わらない

`DEKC040`（読み辞書にない英単語）と `DEKC042`（何かを見せるのに何も喋らないビート）は `voice/` のあるデッキにだけ適用されます。`DEKC041` はトークの長さを `duration` の予算と比べます。Timeline があればナレーションの実尺を、なければ `dekc ls` が出す字数からの見積もりを使います。見積もりには間やデモが入らないので、許容幅を広く取ります（20% ではなく 35%）。`DEKC043`（`voice.toml` の `[beats]` のキーがどこにも当たらない）は `voice/` のあるデッキにだけ適用されます。4 つとも警告で、報告はしますが lint を失敗させません。lint が通るライブ専用のデッキが、声を足したせいで失敗に変わることはありません。

## 出力

診断は SARIF 2.1.0 で統一しています。VS Code も CI もエージェントも同じ形式を読めるようにするためで、rumdl の結果は 2 つ目の run として加わります。人間向けの既定は ESLint 風のテキストです。

直し方が決まっている診断には `hint` が付きます。`data-step` に使える beat id、スライドで使えるクラス、リモート画像の置き先の `assets/` パスなどです。テキストでは `help:` 行、`--json` では `hint` フィールド、SARIF では `slug` や `data` と並んで `properties.hint` に入ります。

すべての診断は `severity`（`error` か `warning`）を持ちます。失敗になるのは error だけです。error が 1 件でも残れば `dekc lint` と `dekc check` は終了コード 1 と `"ok": false` を返し、warning だけなら終了コード 0 と `"ok": true` を返します。テキストではルール ID の後ろに `warning:` と表示し、SARIF では `level` を設定します。rumdl の診断は error として扱います。

診断は直すべきファイルを指します。`DEKC001` は `script.md` の該当する見出し、スライド HTML のルールは問題の要素・属性・URL がある行と列です。lint は種類ごとの最初の一件ではなく、すべての箇所を報告するので、一度の実行で直すものがすべて並びます。メッセージに含まれる値は `data` フィールドにも入るので、エージェントはメッセージを解析せずに `{ "class": "headline" }` や `{ "edges": { "bottom": 591 }, "steps": ["1"] }` を読めます。

```json
{
  "id": "DEKC031",
  "severity": "error",
  "message": "p.note \"補足\" has contrast 1.5 (#333333 on #111111), below 4.5:1 at step 1",
  "path": "slides/objection.html",
  "slug": "objection",
  "hint": "theme.css alone draws it below 4.5:1: fix the pair in theme.css, where one change reaches every slide that uses it",
  "data": { "box": "p.note", "text": "補足", "ratio": 1.5, "threshold": 4.5, "fg": "#333333", "bg": "#111111", "origin": "theme", "steps": ["1"] }
}
```

```bash
dekc lint --format sarif > results.sarif
```

ルールの全表は [Lint ルール](/ja/reference/lint)にあります。

## 次

デッキを送り、書き出す → [発表する](./present)
