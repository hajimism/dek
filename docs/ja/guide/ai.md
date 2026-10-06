---
description: 'CLI と `AGENTS.md` と公式スキル。`check --shot`、お手本にするスライドや ref の `show`、人が指した要素を読む `dekc annotations`。MCP はない。'
---

# AI エージェントと作る

エージェントは、あなたと同じ CLI を使います。MCP サーバも、インストールするツール定義もありません。コーディングエージェントはすでにシェルとファイルエディタを持っていて、スライドは 40 行の HTML ファイルです。エージェント自身のエディタで直接書くのが、いちばん正確で、いちばん安い。dek が足すのは、エージェントが単独ではうまくできないことだけです。描画結果を見ること、読み上げを聞くこと、そして改名と並べ替えという、間違いが起きやすい操作。

## エージェントが読むもの

`dekc init` はプロジェクト直下に短い `AGENTS.md` を書き、`dekc new`・`dekc ref`・`dekc sync` がそれを最新に保ちます。原則、規約、完成を報告する前に確かめること、そして CLI 自身のリファレンスへのポインタ。テーマが決めるクラス・トークン・レイアウトは載せません。テーマはデッキごとに持つので、エージェントは `dekc theme` でそのデッキのテーマを読みます。載せるクラスは、プレイヤーが付ける状態クラス `is-current` と `is-shown` だけです。これはどのテーマが定義するものでもなく、マークアップに書くものでもありません。100 行に収まります。それより細かいことは、必要になったときに CLI から引きます。

dek が持つのは `<!-- dek:begin … -->` から `<!-- dek:end -->` までのブロックだけで、その場で書き直します。チーム独自のエージェント向けメモは、その上か下に書けば残ります。もともとあった `AGENTS.md` は、文面をそのままに、末尾へ dek のブロックが足されます。

```bash
dekc help --agent
```

これだけで、Claude Code でも Codex でも OpenCode でも、追加設定なしに dek のプロジェクトで作業できます。

## プロジェクトの前に：llms.txt とスキル

dek をまだ知らないエージェントや、プロジェクトの外で作業するエージェントには、入口が 2 つあります。

- [`llms.txt`](https://hajimism.github.io/dek/llms.txt) は、dek の入れ方と呼び方、このドキュメントの各ページが扱うこと、lint のルールの数、`dekc help --agent` が出すとおりの全コマンドを示します。`bun run llms` がドキュメント・ルール表・コマンドから作り、公開している版が古くなるとテストが失敗します。
- 公式スキルは、作業のループを教えます。台本から始め、1 枚ずつ `dekc show`、編集、`dekc check --shot`、`dekc lint --visual` と進め、どこで止めるか。罠も扱います。コマンドは `dek` ではなく `dekc` で、dek は Bun で動くので `npx` ではなく `bunx` です。0.2 以降のどの dek にもあるコマンドだけを名指しし、それ以外は `dekc help --agent` と `AGENTS.md` に任せるので、プロジェクトに古い dek が入っていても、ないコマンドを教えることはありません。

```bash
npx skills add hajimism/dek
```

skills CLI が、対応するエージェントにスキルを入れます。Claude Code では、`/plugin marketplace add hajimism/dek` のあと `/plugin install dek@dek` でプラグインとして入ります。npm パッケージにも同じファイルが入っているので、プロジェクトには必ず、その dek に合った版が `node_modules/@hajimism/dek/skills/dek/SKILL.md` にあります。MCP サーバはなく、スキルは CLI の使い方を教えるものです。どちらも `AGENTS.md` と同じく英語です。エージェントは、あなたが話しかけた言語で答えます。

## CLI が約束すること

1. **結果を返すコマンドはすべて `--json` を受け付け、結果の形は一つ。** エージェントは `ok` で分岐し、`false` なら `error` を読み、`diagnostics` を順に片付けます。起動し続ける `dekc` と `dekc rehearse` だけが例外です。この 2 つは `--json` を付けるとサーバーを起動せず、すぐにエラーを返します。JSON を待つ側が永遠に待たないようにするためです。エージェントに文章をパースさせません。約束の中身は[下](#json-の約束)にあります。
2. **エラーは次のコマンドを名指しする。** 「`slides/intro.html` がありません。`dekc sync` を実行してください」。hint は、コマンドを実行した場所からそのまま実行できる文です。デッキを取るコマンドは、そのデッキの外で実行したときにデッキ名を含みます。たとえばプロジェクトのルートなら `dekc theme demo` です。直し方が決まっている診断にも hint が付きます。たとえば、どの beat も指さない `data-step` には `use hook, turn, or 1-2` が返ります。
3. **`dekc help --agent` は数百トークン。** CLI が自分自身のリファレンスです。
4. **`AGENTS.md` は短く保つ。**

## JSON の約束

成功は `{ "ok": true, ... }` で終了コード 0。失敗は `{ "ok": false, "error": { ... }, ... }` で終了コード 1 です。コマンドが実行できなかった場合も、lint や check が error を見つけた場合も同じ形です。

```json
{ "ok": false, "error": { "message": "deck \"nope\" not found", "path": "decks/nope", "hint": "run `dekc ls`" } }
```

```json
{
  "ok": false,
  "error": { "message": "lint found 1 error", "hint": "fix each error in diagnostics, then run `dekc lint` again" },
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
- 実行しなかったチェックは `skipped` の要素になり、空の合格にはなりません。`{ "check": "rumdl", "reason": "rumdl is not installed", "hint": "bun add -d rumdl; …" }` のような形です。すべて実行できたときはこのフィールド自体がありません。`--visual` を付けない `dekc lint` と `dekc build` は、必ず `visual` を載せます。はみ出しもコントラストも測っていないからで、hint は測るためのコマンドです。
- 対象のデッキごとにファイルを書くコマンドは、1 デッキでもリストを返します。`build` と `pdf` は `outs` を返します。
- `dekc lint --format sarif` は同じ診断を SARIF 2.1.0 で返します。
- 各コマンドの形は JSON Schema として [`cli.schema.json`](https://hajimism.github.io/dek/cli.schema.json) で公開しています。`$defs` にコマンドごとの定義があり、実行できなかった行は `failure` です。どのオブジェクトも閉じているので、名前のないフィールドが増えるのは契約の変更です。スキーマ、CLI 自身の型、テストで dek が出力するものは 1 つの定義に対して検査されるので、互いにずれることはありません。

dek が 0.x のあいだは、`--json` の形とルール ID がリリース間で変わることがあります。ルール ID は再利用しません。廃止した ID は廃止のままです。

## 一往復で直す

```bash
dekc check architecture --shot
dekc check architecture --voice
```

`check` は 1 枚だけを lint し（Playwright があれば描画系のルールも含めて）、スクリーンショットを書き、診断と画像のパスを返します。パスには描画内容のハッシュが入るので、返ってきたパスを開いたエージェントが古い画像を見ることはありません。`--voice` は文ごとのカナと尺を返します。HTML を書き、`check` を叩き、絵を見て、読みを確かめ、直す。書いて、見て、聴いて、直すところまでが一往復で済みます。

```bash
dekc shot --sheet
dekc shot architecture --motion
```

1 枚のショットでは得られない見え方が 2 つあります。`--sheet` はデッキ全体を 1 枚の画像にして、枚をまたいだ釣り合いを見せます。`--motion` は 1 枚のビートを時間方向に並べ、動くもの全体の途中の数コマで止めます。文字を隠す入りのアニメーションや、描かれないまま終わる線が静止画で見つかります。どちらの画像も縮小されずに読める大きさで、写っている内容でキャッシュされます。

Playwright がなくても `check` は lint を行い、`skipped` に `visual` を理由と導入用の hint つきで入れます。測っていないことを、エージェントが合格と取り違えることはありません。`voice/` のないデッキで `--voice` を付けた場合も同じで、`voice` を理由と設定方法つきで飛ばし、残りのチェックは実行します。

幾何で決められることは lint ルールにします。はみ出しもコントラストも、ブラウザが測れば答えが一つに決まります。測った判定は、スクリーンショットを見せて「収まっていますか」と尋ねるより信頼できます。

## 指差しは双方向

```bash
dekc goto architecture
dekc current
```

スライドを編集した直後に、エージェントは人間のブラウザをその枚へ飛ばせます。人間が「この枚の図を小さくして」と言えば、エージェントは `dekc current` で slug を知り、どの枚かを聞き返さずに直せます。

slug でわかるのはどの枚かまでで、どの図形かまではわかりません。たとえば工程表に並ぶ 8 本の矢印のうちの 1 本です。そういうときは人間がその図形を指します。開発サーバで `a` を押し、図形をクリックし、注釈を書きます（[やり方](./present#キー操作)）。あとは「注釈を片付けて」と言えば、エージェントが自分で読みます。

```bash
dekc annotations --json
```

ノートごとに、ページのマーカーと同じ番号、人が書いた `text`、各要素のいまのファイルでの `path`・`line`・`column`、`name`、書いたときの文字 `was` といまの文字、`box`、人が見ていたビートでスライドを撮る `shot` が入ります。スライドを直したら、もう一度一覧します。スライド自身の HTML・CSS・スクリプトがノートのあとに変わると `status` が `edited` になり（どれが変わったかは `changed`）、要素が 1 つも残っていなければ `gone` になります。`edited` はスライドが変わったという意味で、ノートが片付いたという意味ではありません。`shot` をノートと見比べてください。`dekc annotations clear` は、ノートを書いて結果を判断する人間に任せます。

プロジェクトに触れないエージェント、たとえば別のマシンのチャットにいるエージェントには、**Copy** で同じノートを渡せます。貼り付けるテキストは、各要素をそれが書かれたファイルと行で示します。

```md
## Notes on decks/plan

Boxes and points are in the slide's own pixels, from its top left.

### Slide 4 of 12, roadmap ("次の四半期のロードマップ"), at beat `milestones`

1. div.arrow.arrow-up at decks/plan/slides/roadmap.html:58:7 (box 1188,286 24×290)
   > 矢じりを大きく

2. 2 elements:
   - div.chevron "画面デザイン" at decks/plan/slides/roadmap.html:30:7 (box 150,380 220×24)
   - div.chevron "デザインレビュー" at decks/plan/slides/roadmap.html:31:7 (box 150,410 220×24)
   > 右端を揃えて

To see it: `dekc shot plan roadmap --step milestones`
```

値はどれもソースから読んだものか、ページ上で測ったものです。名前はタグと、ファイルに書かれたとおりのクラスです（再生中にスクリプトが足すクラスは含みません）。box はスライド自身のピクセル単位で、最後の行は人間が見ていたビートでそのスライドを表示します。要素ではなくスライド上の位置を指したときは、スライドそのものに `point` が付きます。追いかけられない編集で見失った要素は、そう明記したうえで、当時の行のまま残ります。

## リハーサルのあとで

```bash
dekc marks
dekc marks clear
```

開発サーバで声に出してリハーサルし、言いにくいビートごとに `m` を押します。すると `dekc marks` が、書き直しに要るものをエージェントに渡します。`script.md` での見出しの `line`、`was`（印を付けたときのビートの文面）、`text`（いまの文面）です。印はビートの id か、なければタイトルで追いかけるので、前にビートを足しても動きません。文面が変われば `status` は `edited` に、ビートそのものがなくなれば `gone` になります。`dekc marks clear` の前に、新しい文面を声に出してみてください。うまくいくかは、それでしか分かりません。

## スライドを見本にする

```bash
dekc show why-dek timing
```

`show` は、1枚のスライドを作っているものを1回で、ファイルごとに見出しを付けて返します。セクションの台本、スライドの HTML・CSS・TS、`theme.css` のうちそのスライドが実際に使うルール（たどれるトークンと `@keyframes` だけを含む）、参照している assets です。エージェントは theme を全部読まずにそのスライドの組み方を知り、自分のデッキのテーマで書けます。見本のクラスやトークンをうっかり持ち込んでも、lint が拾います。

見本は他人のデッキでも構いません。`dekc ref owner/repo/deck` で固定すれば、`ls`・`show`・`theme`・`shot` に `owner/repo/deck` をデッキとして渡せます。固定した ref は AGENTS.md に載るので、エージェントはどのデッキを見本にしてよいかが分かります。ref は読み取り専用で、エージェントは必要な部分を自分のデッキにコピーします。

## うまくいくプロンプト

```
architecture.html の右カラムを小さくして。終わったら
dekc check architecture --shot を叩いて、はみ出しがないことを確認して。
```

```
dekc current のスライドで、台本の ### 見出しに合わせて
data-step で要素をビートごとに出して。
```

```
script.md に ## recap {#recap} を足した。dekc sync は叩かないで。
開発サーバが骨格を生成するから、その中身を書いて。
```

```
problem の図を data-morph で architecture へ連れていって。
dekc shot problem --to architecture --at 0.5 で途中を撮って、
補間された位置が変じゃないか見て。
```

```
files の数字を、枚が入ってくるときにカウントアップさせて。
slides/files.ts に t だけから描くように書いて、
dekc check files --shot で確かめて。
```

```
hajimism/dek/why-dek を見本にして。dekc ls で budget に一番近い枚を探し、
dekc show で読んで、このデッキのテーマで budget を書いて。
```

```
why-dek の timing みたいなスライドを、このデッキの budget に作って。
dekc show why-dek timing で読んで、このデッキのテーマで書いて、
dekc check budget --shot で確かめて。
```

ドキュメントサイト全体をエージェントに渡すときは [`/llms.txt`](/llms.txt) を使ってください。
