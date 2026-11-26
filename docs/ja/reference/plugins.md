---
description: 'プラグインは dekc lint と dekc check でデッキを検査する実行ファイル dek-<name>。プロジェクトでの導入手順、公式プラグイン、マニフェスト・検査・ロックの仕様。'
---

# プラグイン

プラグインは、dek 本体が知らないプロジェクト固有のチェックを、普段どおり実行する `dekc check` と `dekc lint` に追加する仕組みです。イベントごとのスライド規約や、学習用デッキの伏せ字シールの検証などが代表例です。プラグインの実体はユーザーがインストールする実行ファイル `dek-<name>` で、別プロセスとして動作し、dek とは JSON と SARIF でやりとりします。設計の背景は [ADR 32](https://github.com/hajimism/dek/blob/main/adr/0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md) を参照してください。

## 公式プラグイン

dek には公式プラグイン `dek-study` と `dek-words` が同梱されています。別途インストールする必要はなく、`dek.toml` で名前を有効にするだけでパッケージ内蔵のプラグインが実行されます（`PATH` 上にある同名の `dek-study` や `dek-words` は使いません。[ADR 34](https://github.com/hajimism/dek/blob/main/adr/0034-ship-dek-study-inside-dek-as-its-first-official-plugin.md)）。

### dek-study

学習用デッキで、覚えたい語句の上に伏せ字シールを貼るプラグインです。開発サーバーとビルド済み HTML でスライド上にシールシートを重ねられ、スライドを編集してもシール対象の語句とずれていないか lint で検査できます。

```toml
[plugins.study]
```

シールの定義は、各デッキのフォルダに `study.yaml` として置きます。

```yaml
version: 1
stickers:
  - id: s_8k2f                   # デッキ内で一意
    slide: planning-fallacy      # 対象スライドの slug
    quote: 外部視点               # シールで隠す語句
    prefix: 楽観的に見積もる傾向に、  # 省略可。直前の語句で複数候補を見分ける
```

照合対象はスライド HTML のうち画面に表示されるテキストだけで、`<script>`・`<style>`・`<template>`・`<noscript>` の中身とコメントは除きます。連続する空白は 1 つの空白として扱います。英語など単語を空白で区切る言語では `quote` を単語単位で探すため、`is` が "This" の中に誤マッチすることはありません。日本語・中国語・韓国語・タイ語では文字列として一致を探します。`prefix` を指定したシールはその直後に語句が現れる最初の箇所を、指定しないシールは未覆いの最初の箇所を隠します。`1868` のように YAML が数値や真偽値として解釈してしまう値は引用符で囲んでください。

| ID | 重要度 | 条件 |
| --- | --- | --- |
| `STUDY001` | error | 指定した語句がスライドに見つからない、または対象スライドがデッキにない。語句が別スライド 1 枚にだけ移っていれば hint でそのスライドを示す。同じスライドに残っている場合は、`prefix` の不一致か、すべての候補が別シールで覆われているかをメッセージで伝える |
| `STUDY002` | warning | シールで隠した語句が、同じスライド内の別の箇所にもそのまま露出している |
| `STUDY003` | error | `study.yaml` を読み込めない（YAML 構文エラー、`version` が 1 以外、`id`・`slide`・`quote` の欠落、語句が数値や真偽値扱いになっている、`id` の重複など）。他の有効なシールは続けて検査する |

指摘はいずれも `study.yaml` の該当シールの行を指します。`study.yaml` がないデッキでは検査をスキップします。

#### シート

`dekc sync` で `dek-study` をロックすると、開発サーバーと `dekc build` 出力の全スライドにシート機能が組み込まれます。

- **`r`** キーでシートのオン・オフを切り替えます。初期状態はオフで、選択状態はデッキごとにブラウザへ保存されます。切り替え時に右上へ `SHEET ON` / `SHEET OFF` を短く表示します。
- **シール**は付箋のような淡い黄色の直角矩形として重なります。
- **シールにポインターを乗せる**とすぐにフェードアウトし、黄色の下線を残して下の語句が見えます。ポインターを外すと元に戻ります。
- まだ表示されていないビート上のシールはそのビートまで待機するため、先のビートの内容がネタバレしません。
- 開発サーバーでは、`study.yaml` を編集・保存するとページが自動でリロードされます。

シートは発表者ビュー、スクリーンショット、PDF、PPTX、動画、描画系 lint には含まれません。スライド一覧のサムネイルにも現時点では付かないため、サムネイル上では語句が見えます。

### dek-words

AI が書きがちな表現など、プロジェクトとして発表に使いたくない語句リストで全デッキを検査するプラグインです。該当箇所は警告になり、言い換え案が hint として表示されます。語句リストはプロジェクトごとに用意する仕組みで、dek 側には同梱しません（[ADR 36](https://github.com/hajimism/dek/blob/main/adr/0036-ship-dek-words-a-check-for-a-project-s-word-list-as-the-second-official-plugin.md)）。

```toml
[plugins.words]
```

語句リストはロックファイルの隣に `plugins/words/words.yaml` として置きます。プロジェクト内の全デッキがこのリストで検査されます。

```yaml
version: 1
words:
  - word: 解像度                # 探す語。診断にもこの名前が出る
    use: 何がどこまで分かっているかを書く   # 言い換え案。診断の hint になる
  - word: 〜した瞬間
    pattern: た瞬間              # word の代わりに使う正規表現
  - word: 効く
    verb: godan                 # 活用形も検出：効か 効き 効く 効け 効こ 効い
  - word: 突く
    verb: godan
    except:                     # 該当語を含むが対象外にしたい長い語
      - 突き抜ける
  - word: 〇〇
    in: slides                  # スライドのみ、または台本のみに限定
```

| キー | 意味 |
| --- | --- |
| `word` | 必須。大文字・小文字を区別せず文字列一致で探す。ラテン文字・ギリシャ文字・キリル文字・数字で始まるか終わる語は単語単位で照合する（例：`leverage` は `leveraged` には一致しない） |
| `pattern` | `word` の代わりに使う正規表現（`u`・`i` フラグ付き） |
| `verb` | `godan` または `ichidan`。動詞の活用形を検出する。五段動詞は語幹＋各行の活用語尾と音便形（効い・待っ・読ん）で照合し、一段動詞は語幹で照合する（例：「落ちる」→「落ち」）。「見る」のように語幹が 1 文字になる動詞は誤検出が多いため `pattern` を使う。サ変動詞は名詞で登録すれば「活用する」等も拾える。`pattern` とは併用不可 |
| `except` | 該当語を含むが指摘対象から外したい語（1 行に 1 つずつ書く） |
| `use` | 言い換え案。診断の hint として表示される |
| `in` | `slides` または `script`。検査対象をどちらか一方に限定する |

発表のテーマ上どうしても使いたい語は、そのデッキのフォルダに `words.yaml` を置いて許可します。指定にはエントリの `word` の値を使います。

```yaml
version: 1
allow:
  - 物差し
```

スライド側では `dek-study` と同じく可視テキストを対象にします（`aria-hidden` 内の文字も含み、ルビの `rt`・`rp` は除外）。`<br>` は空白とみなし、2 つのブロック要素をまたぐ語は検出しません。和文文字どうしの間のソース改行は空白として扱わないため、2 行に分かれた「解像」と「度」も「解像度」として検出されます。`script.md` では `{#id}` を除いた見出し、継続行を含む段落、リスト項目、表セルを対象にし、frontmatter・コード・HTML コメント・引用は対象外です。プラグインを有効にした状態で `plugins/words/words.yaml` がまだない場合は、作成するまで `WORDS002` で lint に失敗します。

| ID | 重要度 | 条件 |
| --- | --- | --- |
| `WORDS001` | warning | リストの語がスライドまたは台本に含まれている。指摘はその語の開始位置を指し、メッセージにエントリ名（表記が異なる場合は実際に見つかった文字列も）が入る。hint には `use` の値、未設定なら「その語を使わずに書く」が出る。発表に必要な語はデッキの `words.yaml` で許可する |
| `WORDS002` | error | リストまたはデッキの許可ファイルを読めない（YAML 構文エラー、`version` が 1 以外、未定義キー、`word` の欠落、不正な `verb` や語尾不一致、1 文字語幹の一段動詞、`verb` と `pattern` の併用、不正な `pattern` または空文字マッチ、不正な `in`、`word` の重複、未定義エントリへの `allow`、リスト自体の不在）。指摘は該当行を指し、他の有効箇所の検査は継続する。プロジェクト共通リストのエラーはデッキごとではなく 1 回だけ報告する |

`except` と `allow` は 1 行に 1 項目ずつ書いてください。`dek-words` の YAML パーサーは `dek-study` と同じく `[a, b]` 形式のインライン配列を受け付けません。

## プラグインを使う

以下はサードパーティ製プラグインを導入する手順です。公式プラグインでは手順 1 は不要です。

1. `dek-<name>` を、プロジェクトの外にある `PATH` の通った場所へインストールします。
2. `dek.toml` にプラグイン名を追記します。

   ```toml
   [plugins.glossary]
   ```

3. `dekc sync` を実行します。プラグインからマニフェストを取得し、ロックファイル `plugins/glossary/plugin.json` に保存します。このファイルはコミットしてください。
4. `dekc lint` を実行します。プラグインの診断が固有のルール ID（`GLOSSARY001` など）で dek 本体の診断と並んで表示されます。

`AGENTS.md` にはプラグインごとのバージョン・ルール ID・データファイル（プロジェクト単位かデッキ単位かの区別つき）が自動で記載されるため、エージェントも追加された検査内容を把握できます。同梱プラグインについては、このページの該当セクションへのリンクも付きます。

### ロックファイル（`plugin.json`）

`plugins/<name>/plugin.json` には、プロジェクトが承認したマニフェスト（バージョン、ルールと重要度、データファイル一覧）を記録します。全デッキ共通で使うデータファイルも同じフォルダに置き、ロックファイルと一緒にコミットしてください。`dekc lint` はインストール済みプラグインのマニフェストがロックファイルと完全一致するときだけ実行するため、別バージョンが入っているチームメンバーの環境や CI で意図せず挙動が変わるのを防げます（不一致時はスキップとして報告されます）。

プラグインを更新してマニフェストが変わった場合、`dekc sync` は `version 0.1.0 → 0.2.0` や `GLOSSARY003 added (error)` のように差分を表示するだけでロックファイルは自動更新しません。変更内容を確認したうえで、次のコマンドで承認してください。

```bash
dekc sync --accept glossary
```

ロックしているのはバイナリ自体ではなくプラグインのインターフェース仕様なので、macOS で作ったロックファイルをそのまま Linux の CI で使えます。

### プロジェクト側で制御できる範囲

プロジェクトの `dek.toml` でできるのは、ユーザーが導入したプラグインの中から有効にするものを選ぶことだけです。`[plugins.<name>]` 内にキーは書けず（書くと `DEK008`）、実行パスや引数も指定できません。dek は `dek-<name>` を `PATH` からのみ検索し、相対パスやプロジェクト配下を指すエントリ（`bunx` が足す `node_modules/.bin` や direnv / mise が追加するプロジェクト内ディレクトリなど）は無視します。これにより、clone したリポジトリに仕込まれたプラグインが勝手に実行されるのを防ぎます。同じ理由から `bun add -d dek-<name>` でプロジェクト内に入れたプラグインも実行しません（検出時は理由と場所を表示します）。

なお、プラグインは他のインストール済み CLI と同じく実行ユーザーの権限で動作します。別プロセスで動かすのは、プラグインがクラッシュしても dek 本体を巻き込まないための分離です。

### プラグインが走らないとき

`dekc lint` と `dekc check` は、実行できなかったプラグインを合格扱いせず、`--json` の `skipped` に `{ "check": "plugin", "plugin": "<name>", "reason", "hint" }` として記録します。対象は次の 4 ケースです。

- インストールされていない
- プロジェクトにロックファイルがまだない（`dekc sync` で作成）
- インストール済みのマニフェストがロックファイルと一致しない（`dekc sync` で差分を確認）
- より新しいバージョンの dek を要求している

プラグインの実行自体が失敗した場合（マニフェスト取得や検査が 0 以外で終了した、タイムアウトした、SARIF を出力しなかった、ロックにないルール ID を報告した等）は、エラー [`DEK046`](/ja/reference/lint#ルール) になります。デッキ側の問題ではないため、hint にはユーザーへ報告するよう案内が入ります。

`dekc lint` は全デッキに対して各プラグインを実行します。`dekc check <slug>` は対象スライドのデッキでプラグインを実行し、そのスライドに関する指摘（HTML・CSS・TS または `script.md` の該当セクション）と、どのスライドにも属さない error（データファイル読み込み失敗や `DEK046` など）だけを抽出して返します。`dekc build` と開発サーバーはプラグインを実行しません（`dekc check` は rumdl も実行しません）。

## プラグインを書く

プラグインは `dek-<name>` という名前の実行ファイルとして実装します。`<name>` は小文字英字で始まる小文字英数字とハイフン（40 文字以内、`dek` と `md` は予約）で、Windows では `.exe` 拡張子が必要です。次の 2 つのサブコマンドに応答すれば、その他の機能は自由に実装できます。

TypeScript で書く場合は、型定義だけを `@hajimism/dek/plugin` から読み込めます（ランタイムコードは含みません）。

```ts
import type { CheckInput, CheckOutput, PluginManifest } from "@hajimism/dek/plugin";
```

`PluginManifest<"GLOSSARY">` はルール ID の接頭辞を、`CheckOutput<"GLOSSARY001" | "GLOSSARY002">` は未宣言 ID の出力をコンパイル時に検証します。

### `dek-<name> manifest`

マニフェストを JSON で標準出力へ出し、終了コード 0 で終了します。

```json
{
  "schema": 1,
  "name": "glossary",
  "version": "0.1.0",
  "check": {
    "protocol": 1,
    "rules": {
      "GLOSSARY001": { "severity": "error", "summary": "a term is used before it is defined" },
      "GLOSSARY002": { "severity": "warning", "summary": "a term is spelled two ways" }
    }
  },
  "data": [{ "path": "glossary.yaml" }]
}
```

| フィールド | 意味 |
| --- | --- |
| `schema` | マニフェスト形式のバージョン（`1`）。未知のバージョンならスキップし、dek の更新を促す |
| `name` | `dek-<name>` の `<name>` |
| `version` | 英数字と `.`・`+`・`-` のみで構成される 64 文字以内の文字列 |
| `check` | 省略可。省略すると検査を実行しない |
| `page` | 省略可。`{ "api": 1, "keys": ["r"] }` の形式で、プレイヤーとビルドに組み込むページ API 1 の拡張とショートカットキーを宣言する。キーは dek 本体（`a f l m p s`）と被らない英小文字 1 字。現時点では公式プラグインのページのみ有効（[ADR 33](https://github.com/hajimism/dek/blob/main/adr/0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md)） |
| `check.protocol` | 検査プロトコルのバージョン（`1`） |
| `check.rules` | 報告しうる全ルール ID の定義。ID はプラグイン名を大文字化（`-` は `_`）し、3 桁数字を続けた形式（例：`glossary` → `GLOSSARY001`、`acme-talks` → `ACME_TALKS001`） |
| `…severity` | `error` または `warning`。SARIF の `level` ではなくこの定義が使われ、lint を失敗させるのは `error` のみ |
| `…summary` | 1 行、120 文字以内。SARIF のルール一覧にのみ出力 |
| `data` | 省略可。プラグインが読み込むデータファイル一覧（`AGENTS.md` に記載される）。`{ "path": "glossary.yaml" }` はデッキ直下からの相対パス（隠しファイル・デッキ外・dek の予約パスである `script.md`・`theme.css`・`slides/`・`assets/`・`voice/`・`dist/` は不可）。`{ "path": "terms.yaml", "in": "project" }` はプロジェクト共通の `plugins/<name>/` 内ファイル（隠しファイル・フォルダ外・`plugin.json` は不可）。ページ API に渡されるのはデッキ側のファイルのみ（[ADR 35](https://github.com/hajimism/dek/blob/main/adr/0035-let-a-plugin-keep-data-for-the-whole-project-in-plugins-name.md)） |

未知のフィールドは無視されます。エージェント向けの説明文を書く自由記述欄はなく、dek がマニフェストの構造化情報だけから `AGENTS.md` の案内を生成します。マニフェストは毎回決定的に同じ結果を返すようにしてください（制限時間 10 秒）。

### `dek-<name> check --protocol 1`

dek はデッキごとに 1 回、そのデッキのフォルダを作業ディレクトリとして実行し、標準入力へ次の JSON を渡します。

```json
{
  "protocol": 1,
  "dek": "0.5.1",
  "deck": {
    "name": "intro",
    "lang": "ja",
    "slides": [
      { "slug": "planning-fallacy", "title": "計画錯誤", "html": "slides/planning-fallacy.html", "css": null, "ts": null }
    ]
  },
  "pluginDir": "/home/me/talks/plugins/glossary"
}
```

各スライドのパスはデッキフォルダからの相対パスで、存在しないファイルは `null` です。`pluginDir` はプロジェクトの `plugins/<name>/` の絶対パスで、`"in": "project"` のデータファイルはここに置かれます（フォルダ自体が未作成でもパスを渡します。未対応の古い dek からは渡されないため、その場合はプロジェクトデータなしとして扱ってください）。ファイルの読み込み自体はプラグイン側で処理します。

結果は SARIF 2.1.0 形式で標準出力へ出し、指摘の有無にかかわらず終了コード 0 で終了します（0 以外の終了はプラグインの異常終了を意味します）。dek は各結果から次の項目を読み取ります。

| SARIF | dek の診断フィールド |
| --- | --- |
| `ruleId` | `id`（`check.rules` に定義済みであること） |
| `message.text` | `message`（必須） |
| `locations[0].physicalLocation.artifactLocation.uri` | `path`。デッキからの相対パス、またはデッキ内・`pluginDir` 内を指す `file:` URL（範囲外のパスは無視）。`slides/<slug>.html`・`.css`・`.ts` なら `slug` も自動設定 |
| `…region.startLine`、`…region.startColumn` | `line`、`column` |
| `properties.hint` | `hint`（次の一手） |

メッセージと `hint` はそれぞれ 300 文字以内の 1 行へ整形され、重要度はマニフェストの定義に従います。プロジェクト共通データファイルの不備のように `pluginDir` 配下への同一指摘が複数デッキから返った場合は、1 件に集約して報告します。

検査コマンドは「同じ入力に同じ出力を返す・ファイルを書き換えない・ネットワーク通信をしない」という契約を守ってください。制限時間は 1 デッキあたり 30 秒で、超過すると `SIGTERM` に続けて `SIGKILL` で強制終了し、以降のデッキではそのプラグインを走らせません。

### ページ API 1

ページ拡張は、開発サーバーのプレイヤーおよび `dekc build` 出力の中で dek 本体プレイヤーの後に読み込まれ、グローバル変数 `dek` だけを参照します。

```ts
import type { DekPage } from "@hajimism/dek/plugin";
declare const dek: DekPage;

dek.plugin("glossary", { api: 1 }, (api) => {
  api.deck;                 // { name }
  api.slides;               // [{ slug, title }]
  api.current();            // { slug, index, beat }。beat 0 はスライド表示直後
  api.on("change", (position) => {});            // 初期化時に 1 回、以降は移動完了のたびに発火
  api.on("mount", ({ slug, root, layer, view }) => {});
  api.shown(element);       // まだ表示されていないビートに隠れていないか
  api.data("glossary.yaml");   // { text, version } | null。マニフェスト宣言ファイルのみ
  api.key("r", () => {});   // 未宣言のキーなら false を返す
});
```

- `mount` はステージ上の全スライドで呼ばれます（`view` は `"stage"`）。ライブリロードで差し替わったスライドでも再実行されます。`root` は lint 済みのスライド要素なので読み取り専用として扱い、書き換えないでください。`layer` はスライドの上に重なる ShadowRoot（座標はスライド自身のピクセル、そのプラグイン専用）です。表示されるのは現在スライドのレイヤーだけで、土台はポインターイベントを通過させるため、クリック等を受けたい要素には `pointer-events: auto` を指定してください。
- 非表示スライドのレイヤーはサイズが 0 になるため、要素の寸法計測は `change` コールバック内で実行します。
- ページ拡張は発表者ビュー、動画、スクリーンショット・PDF・PPTX・描画 lint 用のページには読み込まれません。
- 拡張内で投げられた例外はキャッチしてコンソールへプラグイン名とともに出力するため、プレイヤー本体が止まることはありません。
