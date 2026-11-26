---
description: 'CLI、`AGENTS.md`、公式スキル、`dek-design` スキル。`check --shot`、見本や ref を読む `show`、人の注釈を読む `dekc annotations`。MCP サーバーは不要。'
---

# AI エージェントと作る

AI エージェントは、人間とまったく同じ CLI を使います。MCP サーバーも専用のツール定義も不要です。コーディングエージェントはすでにシェルとファイルエディタを備えており、スライドは 1 枚約 40 行の HTML ファイルなので、エディタで直接編集するのが最も正確で低コストです。dek が補うのは、エージェント単体では手が届かない部分（描画結果の確認、読み上げの検証、ミスの起きやすい改名や並べ替え）だけです。

## エージェントが読むもの

`dekc init` はプロジェクト直下に短い `AGENTS.md` を生成し、`dekc new`・`dekc ref`・`dekc sync` がそれを最新状態に保ちます。ここには設計原則、基本規約、完了報告前の確認項目、CLI リファレンスへの案内だけを 100 行以内で収めています。テーマ固有のクラス・トークン・レイアウトはデッキごとに異なるため `AGENTS.md` には書かず、エージェントが必要に応じて `dekc theme` で読み取ります（例外はプレイヤーが動的に付ける状態クラス `is-current`・`is-shown` だけで、これはどのテーマにも共通ですがマークアップには書かない旨を明記しています）。

dek が自動更新するのは `<!-- dek:begin … -->` から `<!-- dek:end -->` までのブロックだけです。チーム独自のルールやメモはその上下に書けば消えずに残ります。もともと `AGENTS.md` があるリポジトリでは、既存の文面をそのまま残して末尾に dek のブロックを追記します。

```bash
dekc help --agent
```

このコマンド 1 つで、Claude Code でも Codex でも OpenCode でも追加設定なしに作業を始められます。

## プロジェクトの外から使う：llms.txt とスキル

dek をまだ知らないエージェントや、プロジェクトの外で作業するエージェント向けには、2 つの入口を用意しています。

- [`llms.txt`](https://hajimism.github.io/dek/llms.txt)：インストール方法と呼び出し方、このドキュメントの各ページの概要、lint ルールの数、`dekc help --agent` と同じ全コマンド一覧をまとめています。`bun run llms` でドキュメント・ルール表・コマンド定義から生成しており、公開ファイルが古くなるとテストが失敗する仕組みです。
- 公式スキル：dek での作業フローをまとめたガイドです。台本から始めて 1 枚ずつ `dekc show`・編集・`dekc check --shot`・`dekc lint --visual` を回し、ブラウザ上で修正箇所に注釈を付けてエージェントに直させ、どの時点で作業を終えるかまでをカバーしています。よくある落とし穴（コマンドは `dek` ではなく `dekc`、Bun 前提なので `npx` ではなく `bunx` を使うこと）も押さえています。v0.2.2 以降の全バージョンに共通するコマンドだけを記載し、それ以外は `dekc help --agent` と `AGENTS.md` に委ねているため、古いバージョンの dek が入ったプロジェクトでも存在しないコマンドを案内しません。

```bash
npx skills add hajimism/dek --skill dek
```

skills CLI を使うと、対応する各エージェントへスキルを導入できます。Claude Code の場合は `/plugin marketplace add hajimism/dek` に続けて `/plugin install dek@dek` でプラグインとしてインストールできます。

任意で追加できるスキルとして `dek-design` も用意しています。見出しに主張を一文で書く、主役となる焦点を 1 つに絞る、色・大きさ・位置の違いには必ず意味を持たせる、といった「ひと目で読めるスライド」の指針（lint では測れない領域）を扱います。

```bash
npx skills add hajimism/dek --skill dek-design
```

Claude Code では `/plugin install dek-design@dek` で追加できます。同じスキルファイルは npm パッケージにも同梱されているため、プロジェクト内には常にその dek のバージョンに合ったファイルが `node_modules/@hajimism/dek/skills/dek/SKILL.md` として存在します。MCP サーバーはなく、スキルが教えるのはあくまで CLI の使い方です。スキルも `AGENTS.md` も英語で書かれていますが、エージェントはユーザーが話しかけた言語で応答します。

`dek-pptx` も任意で追加できます。仕上がったデッキを、受け取った相手が自分のテンプレート上で編集できる PowerPoint ファイルへ `dekc pptx spec` と `dekc pptx --from` で作り直す手順をエージェントに教えるスキルです（[編集するために作り直す](/ja/guide/present#編集するために作り直す)）。`npx skills add hajimism/dek --skill dek-pptx`、Claude Code では `/plugin install dek-pptx@dek` で導入できます。

## CLI が約束すること

1. **結果を返すコマンドはすべて `--json` に対応し、出力形式を統一する。** エージェントは `ok` で成否を分岐し、`false` なら `error` と `diagnostics` を順に処理します。起動し続ける `dekc` と `dekc rehearse` だけが例外で、`--json` を付けてもサーバーを起動せず即座にエラーを返します（JSON を待つ呼び出し側がハングするのを防ぐためです）。文章のパースは一切不要です。詳細は[下のセクション](#json-の約束)を参照してください。
2. **エラーに次の一手を添える。** たとえば「`slides/intro.html` がありません。`dekc sync` を実行してください」のように、hint にはその場からそのまま実行できるコマンドが入ります。デッキを対象にするコマンドをデッキの外（プロジェクト直下など）から実行した場合は `dekc theme demo` のようにデッキ名も補われ、hint 内のファイルパスも診断と同じく現在ディレクトリからの相対パス（`decks/demo/slides/intro.css` など）になります。パスや名前は bash・zsh などの POSIX シェルで 1 語として解釈される形式で出力し、必要に応じて引用符で囲みます（fish は引用符内のバックスラッシュの扱いが異なり、PowerShell や cmd は引用規則が別です）。引用符・バックスラッシュ・制御文字を含むデッキ名やファイル名は `<deck>` のようなプレースホルダーに置き換え、確認方法を添えます。直し方が一意に決まる診断にも hint が付きます（どのビートにも一致しない `data-step` には `use hook, turn, or 1-2` が返るなど）。
3. **`dekc help --agent` は数百トークンに収める。** CLI 自身が簡潔なリファレンスになります。
4. **`AGENTS.md` を短く保つ。**

## JSON の約束

成功時は `{ "ok": true, ... }` で終了コード 0、失敗時は `{ "ok": false, "error": { ... }, ... }` で終了コード 1 を返します。コマンド自体が実行できなかった場合も、`lint` や `check` で error が見つかった場合も同じ形式です。

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

- `error` は必ず `message` を持ち、次の一手が分かれば `hint` を、場所が特定できれば `path` と `line` を持ちます。
- 診断を返すコマンド（`lint`・`check`・`build`・`ls`・`cues`）は成否にかかわらず必ず `diagnostics` 配列を返します。各診断には `severity`、場所があれば `path`・`line`・`column`、直し方が決まっていれば `hint`、メッセージ中の数値を構造化した `data` が入ります。失敗扱いになるのは `error` だけで、`warning` のみなら `"ok": true` です。
- 実行しなかったチェックは `skipped` 配列に入り、空の合格扱いにはなりません（例：`{ "check": "rumdl", "reason": "rumdl is not installed", "hint": "bun add -d rumdl; …" }`）。すべて実行できた場合はこのフィールド自体を省きます。`--visual` を付けない `dekc lint` と `dekc build` は、はみ出し・コントラスト・改行・揃えが未計測であることを示すため必ず `visual` を `skipped` に入れ、hint に計測コマンドを添えます。
- サンドボックスが起動しない環境で Chromium を sandbox なしで動かした場合は、描画を伴うコマンドの出力に `unsandboxed` が付きます（例：`{ "reason": "Running as root without --no-sandbox is not supported. See https://crbug.com/638180.", "hint": "run dekc as a user other than root, …" }`）。描画自体は完了しているため診断結果は有効です。すべて sandbox 内で描画できた場合はこのフィールドを省きます。
- デッキごとにファイルを書き出すコマンド（`build`・`pdf` など）は、対象が 1 デッキだけでもパス一覧を `outs` 配列で返します。
- `dekc lint --format sarif` は同じ診断を SARIF 2.1.0 形式で出力します。
- 各コマンドの出力形式は JSON Schema（[`cli.schema.json`](https://hajimism.github.io/dek/cli.schema.json)）として公開しています。`$defs` にコマンドごとの定義があり、実行失敗時の形式は `failure` です。すべてのオブジェクトは閉じたスキーマで、未定義のフィールドが出るとテストが落ちます。ただし今後のリリースで新しいフィールドが追加されることはあるため、クライアント側は知っているフィールドだけを読み、未知のフィールドは無視してください。既存のフィールド・型・enum の値を削ったり緩めたりする変更は破壊的変更として明記し、0.x の間はマイナーバージョンを上げます。スキーマ、CLI の型定義、テスト時の実出力は単一の定義に対して検証されるため、互いにずれません。

dek が 0.x の間は、`--json` の出力形式とルール ID がリリース間で変わることがあります。廃止したルール ID を別のルールへ再利用することはありません。

## 一往復で直す

```bash
dekc check architecture --shot
dekc check architecture --voice
```

`check` は指定した 1 スライドだけを lint し（Playwright があれば描画系ルールも含む）、スクリーンショットを保存して診断結果と画像パスを返します。ファイル名には描画内容のハッシュが入るため、返ってきたパスを開けば常に最新の画像を見られます。`--voice` を付けると文ごとのカナと尺も返します。HTML を編集し、`check` を実行して画像と読みを確認し、そのまま修正するところまでが一往復で完結します。

```bash
dekc shot --sheet
dekc shot architecture --motion
```

1 枚の静止画だけでは見えない部分を補うオプションも 2 つあります。`--sheet` はデッキ全体を 1 枚のコンタクトシートに並べてスライド間のバランスを確認でき、`--motion` は 1 スライド内の各ビートを時間軸に沿って数コマ並べるため、文字を隠してしまう入場アニメーションや描き切らないまま止まる線を静止画で見つけられます。どちらもエージェントが縮小せずに読めるサイズで出力され、描画内容のハッシュでキャッシュされます。

Playwright が入っていない環境でも `check` 自体は動き、`skipped` に `visual` と導入 hint を入れます。測れていない項目をエージェントが合格と勘違いすることはありません。`voice/` のないデッキで `--voice` を付けた場合も同様に、`voice` を理由と設定方法つきでスキップしつつ残りの検査を実行します。

幾何学的に判定できる問題はすべて lint ルールにしています。はみ出しやコントラストは実ブラウザで測れば答えが一意に決まるため、スクリーンショットを見せて「収まっていますか」と尋ねるよりはるかに確実です。

## 指差しは双方向

```bash
dekc goto architecture
dekc current
```

スライドを編集した直後に、エージェント側からブラウザの表示をそのスライドへ切り替えられます。逆に人が「このスライドの図を小さくして」と頼めば、エージェントは `dekc current` で表示中の slug を取得できるため、どのスライドかを聞き返さずに修正できます。

ただし slug だけで分かるのは「どのスライドか」までで、工程表に並ぶ 8 本の矢印のうちどれを指しているかまでは伝わりません。そういうときは開発サーバーで `a` を押し、対象の図形をクリックして注釈を書きます（[操作方法](./present#キー操作)）。あとは「注釈を片付けて」と伝えるだけで、エージェントが自分で読み取ります。

```bash
dekc annotations --json
```

各注釈には、画面のマーカーと同じ番号、人が書いた `text`、対象要素の現在ファイルでの `path`・`line`・`column`、`name`、記述当時のテキスト `was` と現在のテキスト、座標の `box`、人が見ていたビートを撮影する `shot` コマンドが入ります。修正後にもう一度一覧すると、スライドの HTML・CSS・TS が注釈より後に変更されていれば `status` が `edited`（変更ファイルは `changed`）、対象要素が 1 つも残っていなければ `gone` になります。`edited` はあくまでファイルが変わった合図であり、注釈どおりに直った保証ではないため、必ず `shot` で結果を見比べてください。`dekc annotations clear` は、修正結果を確認した人間が実行します。

別マシンのチャットなど、プロジェクトに直接触れないエージェントには、画面の **Copy** ボタンで同じ注釈をテキストとして渡せます。コピーされる内容には各要素のファイルパスと行番号が含まれます。

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

記載される値はすべてソースコードの解析結果またはブラウザ上の実測値です。要素名はタグとファイルに書かれたクラスだけで構成され、再生中にランタイムが足すクラスは含まれません。`box` はスライド自身のピクセル座標で、末尾のコマンドは注釈を付けた時点のビートを再現します。要素ではなく空白座標を指した場合はスライド自体に `point` が付きます。大幅な編集で追跡できなくなった要素は、見失った旨を明記したうえで当時の行番号のまま残ります。

## リハーサルのあとで

```bash
dekc marks
dekc marks clear
```

開発サーバーで声に出してリハーサルしながら、言いにくいビートで `m` を押しておくと、`dekc marks` が書き直しに必要な情報をまとめて返します。`script.md` 上の見出し行 `line`、マーク当時の文面 `was`、現在の文面 `text` です。マークはビートの id（なければタイトル）で追跡するため、手前にビートを足してもずれません。文面が変わると `status` は `edited` に、ビート自体が消えると `gone` になります。`dekc marks clear` で消す前に、書き直した文面を実際に声に出して確かめてください。言いやすくなったかどうかは、声に出して初めて分かります。

## スライドを見本にする

```bash
dekc show why-dek timing
```

`show` は、1 枚のスライドを構成するファイルを 1 回のコマンドで見出し付きでまとめて出力します。`script.md` の該当セクション、スライドの HTML・CSS・TS、`theme.css` からそのスライドが実際に使うルール（参照するトークンと `@keyframes` のみ抽出）、参照中のアセット一覧です。エージェントは `theme.css` 全体を読まずにスライドの組み方を把握し、自分のデッキのテーマに合わせて書けます。見本側のクラスやトークンをうっかり混ぜてしまっても lint が検出します。

見本には他人のデッキも使えます。`dekc ref owner/repo/deck` で固定すれば、`ls`・`show`・`theme`・`shot` にデッキ名として `owner/repo/deck` をそのまま渡せます。作者から `dekc pack` のアーカイブを受け取った場合は、`dekc ref <file>.tgz` で固定して `file/<deck>` として参照します。固定した ref は `AGENTS.md` にも載るため、エージェントはどのデッキを見本にしてよいかを自動で把握できます。

ref は読み取り専用なので、エージェントは必要な構成だけを自分のデッキへ取り込みます。ref の中身は他人が書いた文章であるため、dek の hint が ref を引用することはなく、ref 内に不可視文字が含まれている場合はコマンドが `hidden` フィールドで位置を報告します。ref と同じテイストでデッキ全体を組みたいときは `dekc new <name> --theme-from <ref>` で始めてください。そうすれば `dekc theme <ref> <layout>` が出すマークアップがそのまま自分のデッキの lint を通ります。

## うまくいくプロンプト

```
architecture.html の右カラムを小さくして。終わったら
dekc check architecture --shot を実行して、はみ出しがないか確認して。
```

```
dekc current のスライドで、台本の ### 見出しに合わせて
data-step で要素をビートごとに出して。
```

```
script.md に ## recap {#recap} を足した。dekc sync は実行しないで。
開発サーバーが骨格を生成するから、その中身を書いて。
```

```
problem の図を data-morph で architecture へ引き継いで。
dekc shot problem --to architecture --at 0.5 で途中を撮って、
補間された位置がおかしくないか見て。
```

```
files の数字を、スライドが入ってくるときにカウントアップさせて。
slides/files.ts に t だけから描くように書いて、
dekc check files --shot で確かめて。
```

```
hajimism/dek/why-dek を見本にして。dekc ls で budget にいちばん近いスライドを探し、
dekc show で読んで、このデッキのテーマで budget を書いて。
```

```
why-dek の timing みたいなスライドを、このデッキの budget に作って。
dekc show why-dek timing で読んで、このデッキのテーマで書いて、
dekc check budget --shot で確かめて。
```

ドキュメントサイト全体をエージェントへ渡したいときは [`/llms.txt`](/llms.txt) を使ってください。
