---
description: 'lint はルールで測れる問題をすべて検出し、`--visual` は実ブラウザの描画を測る。残りの判断は作者に委ねる。'
---

# Lint

lint は、ルールで機械的に判定できる問題をすべて検出します。`dekc lint --visual` が通らないうちはデッキは未完成です。もっとも、通ったからといってデッキの出来が良いとまでは言えません。わかるのは「ルールで測れる問題が残っていない」ことだけです。スライドのバランス、話の筋、時間配分などは、コンタクトシートと台本を見ながら作者が判断します。

開発サーバーは保存のたびに lint を走らせるため、作業中のデッキは常に「通っている」か「どこが通らないかが明示されている」かのどちらかです。手動で `dekc lint` を実行するのは、主に CI と 1 枚だけ確認したい場面くらいです。

```bash
dekc lint
dekc lint --fix
dekc lint --visual
dekc lint --format sarif
dekc check architecture --shot
```

`--fix` は先に `sync` を走らせ、HTML がまだないスライド（`DEK001`）に骨格を生成します。一度でも手を入れたスライドには一切触れず、書き換えや削除の対象になるのは未編集の骨格だけです。

## 層

一般的な Markdown のスタイルチェックは [rumdl](https://github.com/rvben/rumdl) に委ね、dek 側は rumdl には判定できない固有のルールだけを受け持ちます。rumdl の導入は任意です。dek は `DEK_RUMDL`、`PATH`、dek 本体のインストール先にある `node_modules/.bin` の順で探します（clone したリポジトリが任意バイナリを仕込めるため、カレントディレクトリからは探しません）。見つからなければスキップし、テキスト出力には `rumdl: skipped (rumdl is not installed)` と導入方法の `help:` 行を、`--json` には同じ理由と hint を含む `"skipped"` を、SARIF には tool execution notification を出力します。なお `dekc init` が生成する `.rumdl.toml` では、frontmatter と `##` から始まる台本に合わせて先頭行見出しのルールを無効にしています。

| 層 | 担当 |
| --- | --- |
| Markdown の作法 | rumdl |
| スキーマ | frontmatter と設定。Zod で検証 |
| 整合性 | `script.md` ↔ `slides/*.html`、ビート ↔ `data-step` |
| テーマの契約 | 未定義クラス、インラインスタイル、トークン、スコープ、スライド専用 CSS |
| スライドスクリプト | `slides/<id>.ts` を Node・Bun グローバルから切り離して評価 |
| 自己完結 | リモート URL、欠けたファイル、デッキ外のパス |
| アクセシビリティ | 代替テキストのない画像・図（コントラストは描画の層で検査） |
| 描画 | はみ出し、コントラスト、改行、揃え。実ブラウザで計測 |
| ナレーション | `voice/` のあるデッキのみ |
| 尺 | `duration` のあるデッキのみ |
| プラグイン | プロジェクト固有の規約。固定した `dek-<name>` が検査（[プラグイン](/ja/reference/plugins)） |

## `--visual`

はみ出し（`DEK030`）とコントラスト（`DEK031`）は、Playwright 経由で実ブラウザに描画して測ります。どちらも幾何学的・数値的に答えが 1 つに決まるため、スクリーンショットを見せて「収まっていますか」と聞くのではなく実測で判定します。

全スライドの全ビートを 1 回のブラウザセッションで描画し、計測結果をデッキ内の `.cache/visual` にキャッシュします。キャッシュキーはテーマ・CSS・スクリプト・アセットを含む描画内容と計測コードのハッシュなので、2 回目以降の `--visual` は変更したスライドの分しかかかりません。コントラストは実際に描画されたピクセルから算出するため、グラデーションや背景画像、光彩の上にある文字も聴衆に見えるとおりに判定されます（詳しくは [DEK031](/ja/reference/lint#dek031) を参照）。

指摘には、対象の要素・テキスト冒頭・はみ出し量やコントラスト比が入ります。

```
slides/objection.html: DEK030 li "https://example.com/very…" overflows the right edge by 102px at steps slow, vague
  help: shorten it, or let it wrap with overflow-wrap: anywhere in slides/objection.css
slides/objection.html: DEK031 p.note "補足" has contrast 1.5 (#333333 on #111111), below 4.5:1 at steps slow, vague
  help: theme.css alone draws it below 4.5:1: fix the pair in theme.css, where one change reaches every slide that uses it
```

下方向へはみ出したリストは、項目ごとではなくリスト全体で 1 件として報告します（子要素は、親が収まっている辺についてはみ出した分だけ報告する仕組みです）。複数のビートで同じ問題が起きている場合は 1 件にまとめ、該当ビートを並べます。URL のように折り返せない長い文字列は、親要素の枠が収まっていてもはみ出しとして検出します。

コントラストの基準は WCAG AA に従います。本文は 4.5:1、大きな文字（24px 以上、または 18.66px 以上の太字）は 3:1 です。淡い色の大きな数字は通る一方、同じ色を本文に使うとエラーになります。

`--visual` を付けずに `dekc lint` を実行した場合は、未計測であることが明示されます。`--json` の `"skipped"` に `visual` が入り、テキスト出力の末尾にも `visual: skipped` と計測用コマンドが出るため、測っていない結果を「問題なし」と取り違える心配はありません。Playwright が未導入の環境でも、Playwright を要するコマンドだけが導入手順の hint 付きで失敗し、他の CLI 機能はそのまま動きます。

- `dekc lint --visual` は**判定**です。診断を返し（`--format sarif` なら SARIF）、エージェントが自分の出力を検証する主な手段になります。
- `dekc shot` は**観察**です。見た目のバランスや良し悪しは人間の判断に委ねます。

## 声を足しても、失敗の意味は変わらない

`DEK040`（読み辞書にない英単語）、`DEK042`（画面要素はあるのに喋る段落がないビート）、`DEK043`（`voice.toml` の `[beats]` に一致先のないキーがある）は、`voice/` を持つデッキにだけ適用されます。`DEK041` はトークの長さを `duration` の持ち時間と比較し、Timeline があればナレーションの実尺を、なければ `dekc ls` と同じ字数見積もりを使います（見積もりには間やデモが含まれないため、許容幅を 20% ではなく 35% と広めに取ります）。

これら 4 つはいずれも警告（`warning`）であり、lint を失敗させません。ライブ発表用として lint を通っていたデッキが、音声を追加したせいでエラーになることはありません。

## 出力

診断形式は SARIF 2.1.0 を標準としており、VS Code・CI・エージェントが同じフォーマットで読み取れます。rumdl の結果は 2 つ目の run として、プラグインの結果はプラグインごとの run として含まれます。人間向けの既定出力は ESLint 風のテキストです。

直し方が決まっている診断には `hint` が付きます（`data-step` に指定できるビート id、利用可能なクラス一覧、リモート画像の保存先 `assets/` パスなど）。テキスト出力では `help:` 行、`--json` では `hint` フィールド、SARIF では `slug` や `data` と並んで `properties.hint` に入ります。

すべての診断は `severity`（`error` または `warning`）を持ち、終了コードを左右するのは `error` だけです。`error` が 1 件でも残れば `dekc lint` と `dekc check` は終了コード 1 と `"ok": false` を返し、`warning` だけなら終了コード 0 と `"ok": true` を返します。テキスト出力ではルール ID の後に `warning:` と表記され、SARIF では対応する `level` が設定されます。rumdl の指摘は `error` 扱いです。

診断は修正すべきファイルと位置を指します。`DEK001` なら `script.md` の見出し行、HTML ルールなら該当する要素・属性・URL の行と列です。種類ごとの最初の 1 件で止めずに全箇所をまとめて報告するため、1 回の実行で直す対象がすべて出そろいます。メッセージ中の値も `data` フィールドに構造化して入るので、エージェントが文章をパースせずに `{ "class": "headline" }` や `{ "edges": { "bottom": 591 }, "steps": ["1"] }` を読み取れます。

```json
{
  "id": "DEK031",
  "severity": "error",
  "message": "p.note \"補足\" has contrast 1.5 (#333333 on #111111), below 4.5:1 at step 1",
  "path": "theme.css",
  "slug": "objection",
  "hint": "theme.css alone draws it below 4.5:1: fix the pair in theme.css, where one change reaches every slide that uses it",
  "data": { "box": "p.note", "text": "補足", "ratio": 1.5, "threshold": 4.5, "fg": "#333333", "bg": "#111111", "origin": "theme", "steps": ["1"] }
}
```

```bash
dekc lint --format sarif > results.sarif
```

全ルールの一覧は [Lint ルール](/ja/reference/lint)を参照してください。

## 次

デッキを発表し、各種形式へ書き出す → [発表する](./present)
