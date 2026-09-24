# Lint

lint が通ることが完成の定義です。開発サーバは保存のたびに lint を走らせるので、作業中のデッキは常に「通っている」か「なぜ通らないかが分かっている」かのどちらかです。`dek lint` を手で叩く場面はほとんどなく、CI と、1 枚だけを確かめるときのために存在します。

```bash
dek lint
dek lint --fix
dek lint --visual
dek lint --format sarif
dek check architecture --shot
```

`--fix` は HTML のないスライド（`DEK001`）に骨格を作ります。既存ファイルは決して編集しません。

## 層

一般的な Markdown の作法は [rumdl](https://github.com/rvben/rumdl) に委ね、dek は rumdl が原理的に知りえないルールだけを書きます。rumdl は任意です。`PATH`、`node_modules/.bin`、`DEK_RUMDL` の順に探し、見つからなければ黙って飛ばします。`dek init` が書く `.rumdl.toml` は先頭行見出しのルールを無効にしています。台本は frontmatter と `##` で始まるからです。

| 層 | 担当 |
| --- | --- |
| Markdown の作法 | rumdl |
| スキーマ | frontmatter と設定。Zod で検証 |
| 整合性 | `script.md` ↔ `slides/*.html`、ビート ↔ `data-step` |
| テーマの契約 | 未定義クラス、インラインスタイル、トークン、スコープ、スライドごとの CSS |
| スライドスクリプト | `slides/<id>.ts` をサンドボックスで評価 |
| 自己完結 | リモート URL、欠けた画像、デッキ外のパス |
| 描画 | はみ出しとコントラスト。ブラウザで測る |
| ナレーション | `voice/` のあるデッキだけ |
| 尺 | Timeline のあるデッキだけ |

## `--visual`

はみ出し（`DEK030`）とコントラスト（`DEK031`）は Playwright 経由で実際のブラウザで測ります。どちらも幾何の問題で、答えは一つに決まります。dek はスクリーンショットを見せて「収まっていますか」と尋ねるのではなく、測ります。全スライドの全ビートを 1 回のブラウザセッションで描画します。

指摘には、直すべき要素、そのテキストの冒頭、量が入ります。

```
slides/objection.html: DEK030 li "https://example.com/very…" overflows the right edge by 102px at steps slow, vague
  help: shorten it, or let it wrap with overflow-wrap: anywhere in slides/objection.css
slides/objection.html: DEK031 p.note "補足" has contrast 1.5 (#333333 on #111111), below 4.5:1 at steps slow, vague
  help: raise the contrast of its color against the background to 4.5:1
```

下にはみ出したリストは、項目ごとではなくリスト 1 件として報告します。子は、親が収まっている辺についてだけ報告されるからです。複数のビートで同じ指摘は 1 件にまとめ、該当するビートを並べます。URL のように折り返せない文字列は、箱が収まっていてもはみ出しとして数えます。

コントラストの閾値は WCAG AA に従います。本文は 4.5:1。大きな文字、つまり 24px 以上か、18.66px 以上の太字は 3:1。だから、淡い色の大きな数字は通り、同じ色の本文は落ちます。

Playwright がなければ、それを必要とするコマンドだけがインストール手順の hint 付きで失敗します。CLI の他の部分は動きます。

- `dek lint --visual` は判定です。SARIF を返し、エージェントが自分の出力を確かめる一次手段になります。
- `dek shot` は判定ではなく観察です。スライドが良く見えるかどうかは、人間の判断に残します。

## 完成の定義は声で変わらない

`DEK040`（読み辞書にない英単語）と `DEK042`（何かを見せるのに何も喋らないビート）は `voice/` のあるデッキにだけ適用されます。`DEK041` はトークの長さを `duration` の予算と比べます。Timeline があればナレーションの実尺を、なければ `dek ls` が出す字数からの見積もりを使います。見積もりには間やデモが入らないので、許容幅を広く取ります（20% ではなく 35%）。`DEK043`（`voice.toml` の `[beats]` のキーがどこにも当たらない）は `voice/` のあるデッキにだけ適用されます。4 つとも警告で、報告はしますが lint を失敗させません。ライブ専用のデッキは lint が通れば完成で、声を足してもそれは変わりません。

## 出力

診断は SARIF 2.1.0 で統一しています。VS Code も CI もエージェントも同じ形式を読めるようにするためで、rumdl の結果は 2 つ目の run として合流します。人間向けの既定は ESLint 風のテキストです。

直し方が決まっている診断には `hint` が付きます。`data-step` に使える beat id、スライドで使えるクラス、リモート画像の置き先の `assets/` パスなどです。テキストでは `help:` 行、`--json` では `hint` フィールド、SARIF ではメッセージの末尾に出ます。

すべての診断は `severity`（`error` か `warning`）を持ちます。失敗になるのは error だけです。error が 1 件でも残れば `dek lint` と `dek check` は終了コード 1 と `"ok": false` を返し、warning だけなら終了コード 0 と `"ok": true` を返します。テキストではルール ID の後ろに `warning:` と表示し、SARIF では `level` を設定します。rumdl の診断は error として扱います。

診断は直すべきファイルを指します。`DEK001` は `script.md` の該当する見出し、スライド HTML のルールは問題の属性がある行です。メッセージに含まれる値は `data` フィールドにも入るので、エージェントはメッセージを解析せずに `{ "class": "headline" }` や `{ "edges": { "bottom": 591 }, "steps": ["1"] }` を読めます。

```json
{
  "id": "DEK031",
  "severity": "error",
  "message": "p.note \"補足\" has contrast 1.5 (#333333 on #111111), below 4.5:1 at step 1",
  "path": "slides/objection.html",
  "slug": "objection",
  "hint": "raise the contrast of its color against the background to 4.5:1",
  "data": { "box": "p.note", "text": "補足", "ratio": 1.5, "threshold": 4.5, "fg": "#333333", "bg": "#111111", "steps": ["1"] }
}
```

```bash
dek lint --format sarif > results.sarif
```

ルールの全表は [Lint ルール](/ja/reference/lint)にあります。

## 次

デッキを送り、書き出す → [発表する](./present)
