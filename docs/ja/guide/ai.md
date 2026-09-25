# AI エージェントと作る

エージェントは、あなたと同じ CLI を使います。MCP サーバも、インストールするツール定義もありません。コーディングエージェントはすでにシェルとファイルエディタを持っていて、スライドは 40 行の HTML ファイルです。エージェント自身のエディタで直接書くのが、いちばん正確で、いちばん安い。dek が足すのは、エージェントが単独ではうまくできないことだけです。描画結果を見ること、読み上げを聞くこと、そして改名と並べ替えという壊れやすい操作。

## エージェントが読むもの

`dek init` はプロジェクト直下に短い `AGENTS.md` を書き、`dek new`・`dek ref`・`dek sync` がそれを最新に保ちます。三原則、規約、プロジェクトのテーマから抽出したクラス名・トークン・レイアウト、そして CLI 自身のリファレンスへのポインタ。100 行に収まります。それより細かいことは、必要になったときに CLI から引きます。

dek が持つのは `<!-- dek:begin … -->` から `<!-- dek:end -->` までのブロックだけで、その場で書き直します。チーム独自のエージェント向けメモは、その上か下に書けば残ります。もともとあった `AGENTS.md` は、文面をそのままに、末尾へ dek のブロックが足されます。

```bash
dek help --agent
```

これだけで、Claude Code でも Codex でも OpenCode でも、追加設定なしに dek のプロジェクトで働けます。

## CLI が約束すること

1. **結果を返すコマンドはすべて `--json` を受け付け、結果の形は一つ。** エージェントは `ok` で分岐し、`false` なら `error` を読み、`diagnostics` を順に片付けます。起動し続ける `dek` と `dek rehearse` だけが例外です。エージェントに文章をパースさせません。約束の中身は[下](#json-の約束)にあります。
2. **エラーは次のコマンドを名指しする。** 「`slides/intro.html` がありません。`dek sync` を実行してください」。hint はそのまま実行できる文です。直し方が決まっている診断にも hint が付きます。たとえば、どの beat も指さない `data-step` には `use hook, turn, or 1-2` が返ります。
3. **`dek help --agent` は数百トークン。** CLI が自分自身のリファレンスです。
4. **`AGENTS.md` は短く保つ。**

## JSON の約束

成功は `{ "ok": true, ... }` で終了コード 0。失敗は `{ "ok": false, "error": { ... }, ... }` で終了コード 1 です。コマンドが実行できなかった場合も、lint や check が error を見つけた場合も同じ形です。

```json
{ "ok": false, "error": { "message": "deck \"nope\" not found", "path": "decks/nope", "hint": "run `dek ls`" } }
```

```json
{
  "ok": false,
  "error": { "message": "lint found 1 error", "hint": "fix each error in diagnostics, then run `dek lint` again" },
  "diagnostics": [
    {
      "id": "DEK011",
      "severity": "error",
      "message": "slide contains an onclick attribute",
      "path": "slides/intro.html",
      "line": 6,
      "column": 11,
      "slug": "intro",
      "hint": "remove it; a slide takes no input, and motion goes in slides/intro.ts as a draw(t) function",
      "data": { "kind": "attribute", "name": "onclick", "value": "go()" }
    }
  ]
}
```

- `error` は必ず `message` を持ち、dek が次の一手を知っていれば `hint` を、失敗に場所があれば `path` と `line` を持ちます。
- 診断を返すコマンド（`lint`、`check`、`build`、`ls`、`cues`）は、成否に関わらず必ず `diagnostics` 配列を持ちます。各診断は `severity`、場所があれば `path`・`line`・`column`、直し方が決まっていれば `hint`、メッセージに含まれる値を `data` として持ちます。失敗になるのは error だけで、warning だけなら `"ok": true` です。
- 実行しなかったチェックは `skipped` の要素になり、空の合格にはなりません。`{ "check": "rumdl", "reason": "rumdl is not installed", "hint": "bun add -d rumdl; …" }` のような形です。すべて実行できたときはこのフィールド自体がありません。
- 対象のデッキごとにファイルを書くコマンドは、1 デッキでもリストを返します。`build` と `pdf` は `outs` を返します。
- `dek lint --format sarif` は同じ診断を SARIF 2.1.0 で返します。

dek が 0.x のあいだは、`--json` の形とルール ID がリリース間で変わることがあります。ルール ID は再利用しません。廃止した ID は廃止のままです。

## 一往復で直す

```bash
dek check architecture --shot
dek check architecture --voice
```

`check` は 1 枚だけを lint し（Playwright があれば描画系のルールも含めて）、スクリーンショットを書き、診断と画像のパスを返します。パスには描画内容のハッシュが入るので、返ってきたパスを開いたエージェントが古い画像を見ることはありません。`--voice` は文ごとのカナと尺を返します。HTML を書き、`check` を叩き、絵を見て、読みを確かめ、直す。書いた、見た、聴いた、直した。一往復でループが閉じます。

Playwright がなくても `check` は lint を行い、`skipped` に `visual` を理由と導入用の hint つきで入れます。測っていないことを、エージェントが合格と取り違えることはありません。`voice/` のないデッキで `--voice` を付けた場合も同じで、`voice` を理由と設定方法つきで飛ばし、残りのチェックは実行します。

幾何で決められることは lint ルールにします。はみ出しもコントラストも、ブラウザが測れば答えが一つに決まります。測った判定は、スクリーンショットを見せて「収まっていますか」と尋ねるより信頼できます。

## 指差しは双方向

```bash
dek goto architecture
dek current
```

スライドを編集した直後に、エージェントは人間のブラウザをその枚へ飛ばせます。人間が「この枚の図を小さくして」と言えば、エージェントは `dek current` で slug を知り、どの枚かを聞き返さずに直せます。

## スライドを見本にする

```bash
dek show why-dek timing
```

`show` は、1枚のスライドを作っているものを1回で、ファイルごとに見出しを付けて返します。セクションの台本、スライドの HTML・CSS・TS、`theme.css` のうちそのスライドが実際に使うルール（たどれるトークンと `@keyframes` だけを含む）、参照している assets です。エージェントは theme を全部読まずにそのスライドの組み方を知り、自分のデッキのテーマで書けます。見本のクラスやトークンをうっかり持ち込んでも、lint が拾います。

見本は他人のデッキでも構いません。`dek ref owner/repo/deck` で固定すれば、`ls`・`show`・`theme`・`shot` に `owner/repo/deck` をデッキとして渡せます。固定した ref は AGENTS.md に載るので、エージェントはどのデッキを見本にしてよいかが分かります。ref は読み取り専用で、エージェントは必要な部分を自分のデッキにコピーします。

## うまくいくプロンプト

```
architecture.html の右カラムを小さくして。終わったら
dek check architecture --shot を叩いて、はみ出しがないことを確認して。
```

```
dek current のスライドで、台本の ### 見出しに合わせて
data-step で要素をビートごとに出して。
```

```
script.md に ## recap {#recap} を足した。dek sync は叩かないで。
開発サーバが骨格を生成するから、その中身を書いて。
```

```
problem の図を data-morph で architecture へ連れていって。
dek shot problem --to architecture --at 0.5 で途中を撮って、
補間された位置が変じゃないか見て。
```

```
files の数字を、枚が入ってくるときにカウントアップさせて。
slides/files.ts に t だけから描くように書いて、
dek check files --shot で確かめて。
```

```
hajimism/dek/why-dek を見本にして。dek ls で budget に一番近い枚を探し、
dek show で読んで、このデッキのテーマで budget を書いて。
```

```
why-dek の timing みたいなスライドを、このデッキの budget に作って。
dek show why-dek timing で読んで、このデッキのテーマで書いて、
dek check budget --shot で確かめて。
```

ドキュメントサイト全体をエージェントに渡すときは [`/llms.txt`](/llms.txt) を使ってください。
