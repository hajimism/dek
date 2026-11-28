---
description: 'dekc の全コマンド、共通規約、フラグ、環境変数のリファレンス。'
---

# CLI

プロジェクトの作成には `bunx @hajimism/dek init` を使います。dek 本体も同時にプロジェクトへインストールされます（手順は[はじめる](/ja/guide/getting-started)を参照）。このページの例では `dekc` と略記しますが、実際はプロジェクト内での `bunx dekc`、プロジェクト外での `bunx @hajimism/dek` を指します。`dek` とは打たないでください（`bunx dek` は npm 上の無関係な別パッケージを実行してしまいます）。

## 規約

- **対象スコープは実行場所で決まる。** プロジェクト直下なら全デッキ、デッキディレクトリ内ならそのデッキが対象になります。どこからでも先頭の位置引数または `--deck <name>` で対象を指定できます（例：`dekc lint why-dek`、`dekc show why-dek intro`、`dekc why-dek`）。詳細は[プロジェクトとデッキ](/ja/guide/structure#実行場所がスコープを決める)を参照してください。
- **結果を返すコマンドはすべて `--json` に対応し、外側の形式は統一されている。** 成功時は `{ "ok": true, ... }`（終了コード 0）、失敗時は `{ "ok": false, "error": { "message", "hint", "path", "line" }, ... }`（終了コード 1）です。実行失敗でも `lint` / `check` の error 検出でも同じ形式になります。`hint` は次の一手が分かる場合、`path`・`line` は場所を特定できる場合に付きます。診断を返すコマンド（`lint`・`check`・`build`・`ls`・`cues`）は成否にかかわらず `diagnostics` 配列を返します。常駐する `dekc` と `dekc rehearse` は `--json` を受け付けません（[JSON の約束](/ja/guide/ai#json-の約束)を参照）。
- **出力形式は JSON Schema で定義されている。** [`cli.schema.json`](https://hajimism.github.io/dek/cli.schema.json) の `$defs` にコマンドごとのスキーマがあります。
- **0.x の間は仕様が変わる場合がある。** `--json` の構造やルール ID はリリース間で変更される可能性がありますが、廃止したルール ID を別ルールへ再利用することはありません。
- **診断は SARIF 2.1.0 に対応している。** `dekc lint --format sarif` では URI が `file://`、位置が行・列、`hint`・`slug`・`data` が `properties`、スキップされた検査が tool execution notification になります。既定の人間向け出力は ESLint 風の `path:line:column: id message` です。
- **終了コードを失敗にするのは `error` だけ。** 診断はすべて `severity` を持ち、`error` が残ると `lint`・`check`・`pub publish` が `"ok": false`（終了コード 1）を返します。`warning` のみなら終了コード 0 です。
- **`init` と `sync` は手書きのファイルを上書きしない。** 不足分だけを生成し、余剰ファイルは警告します。`sync` が書き換え・削除するのは未編集の骨格スライドだけです（元セクションの変更に追従して書き換え、セクションが消えて横に CSS / TS もなければ削除）。`AGENTS.md` は `<!-- dek:begin … -->` 〜 `<!-- dek:end -->` のブロックだけを更新します。リネームは自動ではしません。
- **すべてのエラーに `hint` が付く。** 次に実行すべきコマンドを具体的に示します。直し方が決まっている診断にも `hint` が付きます（`data-step` に有効なビート id、定義済みクラス一覧、リモート画像の保存先 `assets/` パスなど）。
- **テキスト出力から外部由来の制御文字を無害化する。** デッキや ref に含まれる制御文字（改行・タブを除く）は `U+FFFD` へ置換して出力するため、端末の色コードは dek 自身のものだけが届きます（`--json` では原文のまま返します）。
- **ソースツリー内のパスは作業ディレクトリからの相対パス。** 診断・エラー・`init` / `new` / `sync` が作成したファイルはテキストでも `--json` でも相対パスです。ビルド結果やスクリーンショットなどの成果物は絶対パス、SARIF は絶対 URI のままです。
- **未実行のチェックは `"skipped"` に記録する。** 各要素は `check`・`reason` と、実行可能にする方法があれば `hint` を持ちます。主なケースは、Playwright 未導入時の `dekc check`（`visual`）、`voice/` なしでの `dekc check --voice`（`voice`）、未導入・未ロック・ロック不一致・dek バージョン不足のプラグイン（`plugin`）、rumdl の未導入・非 SARIF 出力・30 秒超過（超過時は強制終了し以降のデッキでスキップ）（`rumdl`）、URL または Playwright 不足時の `dekc build`（`preview`）、ref に対する `dekc ls`（`lint`）です。テキスト出力では標準エラーへ `<check>: skipped (<reason>)` と `help:` 行を出し、標準出力を汚しません。すべて実行できた場合はフィールド自体を省きます。
- **Chromium を sandbox なしで描画した場合は明示する。** コンテナの `root` 実行や Ubuntu 23.10 以降など sandbox が起動しない環境でも、`check`・`lint --visual`・`shot`・`build`・`pdf`・`pptx`・`video` は自プロジェクトのデッキを描画し、1 回の実行につき 1 度だけ標準エラーへ `warning: Chromium drew without its sandbox` を出し、`--json` に `unsandboxed`（Chromium 側の `reason` と `hint`）を含めます。`dekc shot <ref>` は安全のため失敗し、`DEK_ALLOW_UNSANDBOXED=1` 指定時のみ描画します（[自分が書いていないプロジェクト](/ja/guide/architecture#自分が書いていないプロジェクト)を参照）。
- **デッキごとにファイルを出力するコマンドは配列を返す。** `build` や `pdf` は対象が 1 デッキだけでも出力パスを `outs` 配列で返します。
- **ref は読み取り専用。** `ls`・`show`・`theme`・`shot` はデッキ名の代わりに ref 名（`owner/repo/deck`、pack なら `file/<deck>`）を受け付けます。`dekc new --theme-from` は ref のテーマを新デッキへコピーします。その他のコマンドは ref を受け付けず、開発サーバーを含めどのコマンドも `refs/` スナップショット内からは実行できません（[ref](#ref) を参照）。
- **ヘルプと候補提示。** `dekc help <command>`・`dekc <command> --help`・`-h` で詳細な使い方と全フラグを表示し、`dekc --version`（`-v`）でバージョンを表示します。コマンド名・サブコマンド名・デッキ名を打ち間違えると `did you mean …?` で候補を出します。
- **フラグを厳密に検証する。** `--json`・`--help`・`--version` は共通です。`--deck` は `new`・`ref`・`help`・単独の `pub`・`pub login` / `logout` / `whoami` 以外で使えます。誤記や未対応フラグを黙って無視せずエラーにし、有効なフラグと `dekc help <command>` を hint に示します。値も実行前に検証し（`--port` は 1〜65535 の整数、`--fps` は正の数、`--accent` は 0 以上の整数、`--format` は `sarif` のみ）、不正値や空値は `invalid --<flag> "<value>"` になります。
- **引数も厳密に検証する。** 不足時は `missing <slug> for dekc show`、過剰時は `unexpected argument "extra" for dekc ls` となり、いずれも使い方と `dekc help <command>` を hint に示します。

## 開発

| コマンド | 役割 |
| --- | --- |
| `dekc [deck] [--visual] [--port N] [--remote]` | 開発サーバーを起動（起動時・保存時の sync、ライブリロード、保存時 lint、発表者ビュー）。プロジェクト直下では全デッキを `/decks/<deck>/` で、デッキ指定またはデッキ内ではそのデッキだけを `/` で配信する。開発サーバーはデッキごとに 1 つずつ並行稼働でき、プロジェクト全体のサーバーは他サーバーが動いていない間だけ起動できる。配信中デッキへの重複起動は稼働中 URL を示して拒否する（指定した `--visual`・`--remote`・`--port` が不足している場合も併記し、再起動を案内。デッキ専用サーバー稼働中のプロジェクト全体起動も別デッキ並行起動または再起動方法を案内。台本を解析できないデッキのサーバーも対象）。`127.0.0.1` と `localhost` のみに応答し、別オリジンからの WebSocket・`goto` や他サイトへの音声・CSS・iframe 埋め込みを拒否する。`--visual` で保存時に描画 lint も実行。`--port` 省略時は空きポートを OS が選択。Ctrl-C に加え親プロセス終了時にも自動で停止する |
| `dekc --remote` | LAN に公開。発表者ビュー・`goto`・`current`・音声タイムラインとオーディオ・配信される診断には、起動のたびに自動生成される 10 文字のパスワードが必要。ターミナルにはパスワード下にスマホ用 QR コードを表示する（1 回限り・5 分有効。Enter で再発行） |
| `dekc rehearse [deck] [slug] [--remote]` | Timeline に沿ってブラウザを自動進行（録画なし）。`--remote` で `dekc --remote` と同じく LAN 公開。対象デッキの開発サーバーを起動するため、すでに配信中のデッキでは拒否して稼働中サーバーのリハーサル URL を案内する |

## プロジェクト

| コマンド | 役割 |
| --- | --- |
| `dekc init [dir] [--deck NAME] [--browser] [--no-install]` | `dir`（既定はカレント）にプロジェクトを作成し、実行中バージョンの dek をインストールする。`--deck` で最初のデッキ（お手本台本と骨格スライド付き、そのまま lint 通過）も同時作成できる。生成ファイルは `dek.toml`（`[pack] license = "CC0-1.0"` 入り。[設定](/ja/reference/config#dek-toml)参照）・`theme.css`・`.gitignore`・`.rumdl.toml`・`tsconfig.json`・`package.json`・`assets/`・`decks/`・`AGENTS.md`・`.dek/schema.json`・`.dek/slide.d.ts`。既存ファイルは上書きせず内容が異なるものを `kept` と表示し、dek 管理ファイルのみ最新化（`updated`）する。既存の `AGENTS.md` には末尾へ dek ブロックを追加し、既存の `theme.css` に必須トークン不足があれば `DEK015` に先立って標準エラーと `--json` の `missingTokens` で知らせる。入力検証は書き込み前に完了し、既存プロジェクト内では実行を拒否して `dekc new` を案内する。続けて `bun add -d --ignore-scripts @hajimism/dek@<version>` を実行する（dek 導入済み・`--no-install`・既存 `package.json` の場合はスキップ）。`--browser` 指定時は `playwright` の追加と `bunx --bun playwright install chromium` も実行する（上位ディレクトリに dek がある場合は解決できないため実行せず、dek 未導入で `--browser` と `--no-install` の併用も事前に拒否）。インストール失敗時もプロジェクト自体は残し、`notInstalled`（`install`・`reason`）と `next` に手動コマンドを案内する |
| `dekc new <name> [--theme-from DECK\|REF]` | 新しいデッキを追加。プロジェクト直下の `theme.css`、または指定したデッキ・ref のテーマをコピーして骨格スライドを作る（そのまま lint 通過）。ref テーマには先頭に ref 名と固定先コメントが入り、ref に LICENSE がなければ `warnings`、不可視文字があれば行位置つきで警告（`--json` の `hidden`）する。デッキ名には `/`・`\`・制御文字・不可視文字・先頭の `-` を使えない（`init --deck` も同じ）。dek 管理ファイルも同時更新し、`updated` と `next` を返す |
| `dekc ls [deck]` | 全デッキの一覧、または 1 デッキの概要を表示（セクション数・枚数・診断数・持ち時間・見積もり・Timeline があれば実尺）。診断は rumdl 以外の dek 本体ルールが集計対象。一覧表示では各デッキの指摘をその行に、プロジェクトの指摘（`dek.toml`）を `project` 行と `--json` 最上位の `diagnostics` に 1 回だけ集計する |

## ref

ref は見本として参照するために `dek.toml` の `[refs]` へ固定した他人のデッキです。`refs/` 内の実体は gitignore 対象で、欠落時や別コミット時は次の参照時に固定コミットから再取得されます。安全のため `refs/` 内のシンボリックリンクはたどらず、リンク越しの読み書きも削除もしません（消すべきリンクを報告）。`packs/` のコピーも通常ファイルとしてのみ扱います。公開リポジトリにはトークン不要、非公開リポジトリには `GITHUB_TOKEN`（または `GH_TOKEN`）を設定してください（例：`GITHUB_TOKEN=$(gh auth token) dekc ref …`）。トークン送信先は `api.github.com` に限定し、`gh` からの自動取得はしません。

GitHub から取得できないデッキは pack で受け渡します。`dekc pack` で書き出した `.tgz` を `dekc ref <file>.tgz` で `file/<deck>` として内部ファイルの SHA-256 に固定し、コピーを `packs/<deck>.tgz`（コミット対象）へ置きます。`file` は pack 用予約名のため、GitHub owner 名 `file` は固定できません。

ref の文章は外部由来のため、dek 自身の出力と厳密に分離します。hint に出るのはコマンド引数としての ref 名だけで、リポジトリ内の他デッキ・フォルダ・レイアウト名や本文は引用しません。メッセージに名前を並べる場合も各 40 文字以内の 1 行、ref のタイトルは `AGENTS.md`・`dekc ref`・`dekc ls` すべてで 80 文字以内の 1 行に制限します。`ls`・`show`・`theme`・`shot` が読んだ ref ファイルに不可視文字（異体字セレクタを除く Unicode default-ignorable 文字、行/段落区切り、行間注釈記号）が含まれていれば行ごとに標準エラーへ警告し、`--json` の `hidden` に `path`・`line`・`column`・`codePoints` を返します（テキスト出力では `⟨U+XXXX⟩` 表記）。`dekc new --theme-from <ref>` でもコピー後のテーマに対して同様に警告します。

| コマンド | 役割 |
| --- | --- |
| `dekc ref <owner/repo/deck>[@rev]` | 既定ブランチまたは `@` 以降の tag・branch・SHA に固定して実体を取得（GitHub のフォルダ URL も可）。使用可能なデッキ名規則は[設定](/ja/reference/config#dek-toml)の `refs` を参照。再実行すると最新へ固定し直し、`--json` で `rev`・`from`・`changed` を返す。サイズ上限はダウンロード 200 MB・展開後 1 GB。リポジトリに LICENSE がなければ警告 |
| `dekc ref <file>.tgz` | pack を `file/<deck>` として固定し、`packs/<deck>.tgz` に保存して展開。内容が変わっていれば固定を更新して `from`・`changed`・`pack` を返し、同一なら何もしない。複数デッキを含む tarball、無効なデッキ名、50 MB 超（展開後 100 MB 超）、スパースファイル・デバイス・連結アーカイブを含む tar は拒否。LICENSE がなければ警告 |
| `dekc pack [deck] [--root-dist]` | 単一デッキをまとめた gzip tar（`dist/<deck>.tgz`）を書き出す。含めるのは `script.md`・`theme.css`・`slides/`・`assets/`・`LICENSE`・空の `dek.toml` のみ（`dist/`・`.cache/`・`voice/`・ドットファイルやプロジェクト設定は除外）。`LICENSE` は `dek.toml` の `[pack] license` 本文、なければプロジェクトの LICENSE ファイル（どちらもなければ未同梱で警告）。無効なデッキ名・50 MB 超・プロジェクト外やリンク切れのシンボリックリンク・ref は不可。`--json` は `outs` と `warnings` を返す |
| `dekc ref` | 固定済み ref の一覧（rev・タイトル・スライド数・未取得状態） |
| `dekc ref rm <ref>` | 固定設定と `refs/` の実体を削除（pack なら `packs/` のコピーも削除） |
| `dekc new <name> --theme-from <ref>` | ref の `theme.css` をコピーして新デッキを作成（`dekc theme <ref> <layout>` のマークアップがそのまま lint を通る）。未取得なら先に取得・展開する。コピーは新デッキの所有となり ref 自体は不変 |
| `dekc ls <ref>` | ref の概要を表示（話速は ref 側の設定を使用）。ref は修正対象ではないため `skipped` に `lint` を入れる |
| `dekc show <ref> <slug>` | 自分のスライドと同じ出力に加え `ref`（名前・rev・実体ディレクトリ・LICENSE パス）を返す。テキスト出力は `ref <name> at <rev>: someone else's deck, read-only` で始まる |
| `dekc theme <ref>`、`dekc shot <ref> <slug>` | ref のテーマ情報とスクリーンショットを取得。スクリーンショットはスナップショット内ではなく自プロジェクトの `.cache/refs/<ref>/shots/` に保存 |

## スライド

| コマンド | 役割 |
| --- | --- |
| `dekc show [deck] <slug>` | 1 枚のスライドを構成するファイル群を見出し付きで一括出力（`script.md` の該当セクション、`slides/<slug>.html`・`.css`・`.ts`、`theme.css` から実際に該当するルールと関連トークン・`@keyframes`、参照アセット）。該当ルールはスライドのマークアップに存在するクラス・レイアウト・要素・属性から絞り込む（`.ts` がある場合は動的生成を考慮し `.slide` 配下の要素・属性ルールを残す）。存在しないファイルは `null`。プロジェクト外を指すシンボリックリンクはエラー。テキスト出力では各セクションを `--- <file>` で区切り、本文中の `--- ` 行は 1 文字下げて偽装を防ぐ。`--json` の `beats` には各ビートの `title`・`line`・（あれば）`id` が順に入る |
| `dekc theme [deck] [layout]` | デッキの `theme.css` が定義するレイアウト・クラス・トークンを一覧表示。クラスは `max_classes` の対象になるマークアップ用クラスのみを挙げ、状態クラス（`is-current`・`is-shown`）は `stateClasses` として分離する。トークンは素の `.slide` に定義されたもの。`layout` を指定するとそのまま貼れる HTML 例を出力する。記号や空白を含む非平易なレイアウト名は一覧と `layouts` から外し `unprintedLayouts` に数える（ref テーマからの文字列注入対策） |
| `dekc check [deck] <slug> [--shot] [--voice]` | 1 枚のスライドを lint（そのスライドのスコープのみ。Playwright があれば描画系ルールも実行。[スコープ](/ja/reference/lint#スコープ)参照）。プラグインも走り、該当スライドの指摘とスライド非依存の error を返す。`--shot` でスクリーンショットを保存してパスを返す。Playwright があれば最終ビートの余白バランスを `fill`（`coverage`・最小包含矩形 `box`・縦横 10 等分の占有率 `rows` / `columns`、各 0〜1）として返す。計測対象はテキスト行・画像/SVG/動画/canvas/背景画像・空の塗りボックス（グラフ棒など）および `aria-hidden` 装飾で、中身のあるカードは中身の領域だけを数え、`::before`/`::after` や未表示ビートは除く。空いた帯は `rows`・`columns` の 0 連続で判断する（テキスト出力では端余白と中間の空きを分けて表示）。`--voice` はカナと尺を返す（`voice/` がなければ `skipped` に `voice` を入れて続行） |
| `dekc shot [deck] [slug] [--step ID\|N]` | 1 枚または全枚のスクリーンショットを `.cache/shots/<slug>~<step>.<hash>.png` に保存（既定は最終ビート、`--step 0` は表示直後）。同じビートを指す別表記は同一ファイルにまとまり、描画ハッシュが変わらない限り再撮影しない（変更時は古い画像を自動削除） |
| `dekc shot [deck] --sheet` | 全スライドの最終ビートをコンタクトシート（`.cache/shots/sheets/<hash>/sheet-<n>.png`）へ並べる。1 枚あたり長辺 1568px 以下・115 万画素以下でビジョンモデルが縮小せず読める最大サイズに収め、長いデッキは複数枚へ分割。各枚のショットキャッシュを再利用するため変更がなければブラウザを起動しない。`--json` は個別ショットも返す |
| `dekc shot [deck] <slug> --motion [--step ID\|N]` | 表示直後と各ビートの動きを 1 行ずつ（0・25・50・75% と完了状態 `end: true`）並べたモーションシートを `.cache/shots/motion/<slug>.<hash>/` に出力（シートは `sheet-<n>.png`、個別コマは `frames/`）。`--json` では `motion` にビートごとの `step`・`frames`（`path`・`ms`）、`sheets` にシート一覧が入り、`shots` は空。`--step` で単一ビートのみ再生可 |
| `dekc shot [deck] <a> --to <b> [--at 0..1]` | `a` 最終ビートから `b` への View Transition を `--at`（既定 0.5）時点で止めた 1 フレームを `.cache/shots/<a>~<b>~<at>.<hash>.png` に保存。`--at 1` 時点でも `b` の入場アニメーションが残る場合があるため全体の動きは `--motion` で確認。`--step` とは併用不可 |
| `dekc mv [deck] <old> <new>` | セクション id、HTML と `data-slug`、付随する `.css` / `.ts`、`voice/voice.toml` のキーを一括改名（見出し文言は不変）。宛先ファイルが 1 つでも既にあれば拒否し、部分適用しない。改名履歴は日時付きで `.dek/renames.json`（コミット対象）へ記録され、dek.pub のコメント追従に使われる（並べ替えは記録しない）。手動改名後に何度実行しても 1 回分だけ記録する |
| `dekc mv [deck] <slug> --before\|--after <slug>` | `script.md` 内でセクションの順序を移動 |
| `dekc goto [deck] <slug>` | 開発サーバーで開いているブラウザを指定スライドへ移動（10 秒タイムアウト）。`--json` の `viewers` は接続ページ数（0 のときは次に開いたページがその位置になり、標準エラーで通知）、`url` は稼働中サーバー上の該当デッキ URL（`127.0.0.1`、`--remote` のパスワードは含まない） |
| `dekc current [deck]` | 開発サーバーで現在表示中のスライドを取得（10 秒タイムアウト）。`viewers` が 0 の場合は次に開くページの初期位置を返し、標準エラーで通知。`--json` の `url` は `goto` と同じく稼働中サーバー上の該当デッキ URL |
| `dekc marks [deck]` | リハーサル中に `m` またはバーの鉛筆ボタンで印を付けたビートを一覧表示（`.dek/marks.json` から読み込み）。各項目に `script.md` の見出し `line`、マーク当時の文面 `was`、現在の文面 `text`、`status`（`open` / `edited` / `gone`）を返す。id（なければタイトル）で追跡するため前への挿入に強い |
| `dekc marks [deck] clear` | デッキのマークを全削除（`--json` の `cleared` に件数） |
| `dekc annotations [deck]` | 注釈モード（`a`）で付けた注釈を `.dek/annotations.json` から一覧表示（読み取りに開発サーバーは不要）。各項目にマーカー番号 `number`、`step`、`text`、`shot` コマンド、`targets`（現在ファイルでの `path`・`line`・`column`・`name`・`was`・`text`・`box`・`found`）、`status`（`open` / `edited`（`changed` 付き） / `gone`）を返す。要素位置は「同位置・同名前・同文字 → 同名前・同文字で一意 → 同位置・同名前 → 同位置・同タグ」の順で再照合して書き戻すため編集をまたいで追従する。`edited` は完了保証ではないため必ず `shot` と見比べること |
| `dekc annotations [deck] clear` | デッキの注釈を全削除（人間が確認した後に実行。`--json` の `cleared` に件数） |
| `dekc sync [deck] [--accept <plugin>]` | 未作成スライドの骨格生成、未編集骨格の更新・不要削除（横に `.css`/`.ts` がある場合は保持）、dek 管理ファイル（`AGENTS.md` の dek ブロック・`.dek/schema.json`・`.dek/slide.d.ts`）の更新、および既存 `.gitignore` への dek 一時ファイル追記（`.dek/server.json`・`marks.json`・`annotations.json`）を実行する。手書きスライド・`AGENTS.md` のブロック外・`tsconfig.json` には触れない。セクションが消えた手書きスライドは残して対処法を標準エラーへ出す（lint は `DEK002`）。`dek.toml` にプラグインがあればマニフェストを取得して `plugins/<name>/plugin.json` にロックし、既存ロックと差分がある場合は変更点を標準エラーへ出して `--accept <plugin>` 指定時のみ更新する（開発サーバーの自動 sync はプラグインを実行しない）。`--json` は `created`・`updated`・`removed`・`kept`、およびプラグイン指定時は `plugins` を返す |

## 成果物

| コマンド | 役割 |
| --- | --- |
| `dekc lint [deck] [--fix] [--visual] [--format sarif]` | デッキを lint。`--fix` は先に `dekc sync` を実行、`--visual` ははみ出し・コントラスト・改行・揃えを追加。ロック済み[プラグイン](/ja/reference/plugins)も各デッキで実行し、走れないものは `skipped` として報告 |
| `dekc cues [deck]` | 読み上げ対象の段落を `Cue[]` で出力（音声エンジン不要） |
| `dekc voice [deck]` | 変更のあった文だけを `.cache/voice/` へ合成（保存時にも自動実行）。話者・バージョン取得 10 秒、読み取得 60 秒、合成 5 分でタイムアウト |
| `dekc voice [deck] speakers` | 音声エンジンの話者一覧を表示 |
| `dekc voice [deck] say <text>` | 指定テキスト 1 文を合成して再生 |
| `dekc voice [deck] dict add <word> <kana> [--accent N]` | `voice/dict.toml` に読み（および任意でアクセント位置）を登録 |
| `dekc voice [deck] pin` | マスター音声と `timeline.json` を `voice/pin/` へ固定保存 |
| `dekc build [deck] [--root-dist] [--url <url>] [--public] [--no-script]` | 1 ファイル HTML（`decks/<deck>/dist/<deck>.html`、または `--root-dist` で `<root>/dist/<deck>.html`）を生成。スライド専用 CSS・TS をインライン化する。lint エラーがあっても止まらず、HTML 未作成セクションは骨格から、動かないスクリプト（`DEK016`）は除外してビルドし、本体ルールの診断件数（`--json` は診断本体）を返す。公開 URL（`dek.toml` の `url` または優先される `--url`）があれば `og:image` 用に 1 枚目の `dist/<deck>.png` も書き出す（[Web で公開する](/ja/guide/present#web-で公開する)）。`--public` はト書きと HTML コメントを除外、`--no-script` は台本と発表者ビューを完全に除外（dek.pub の台本非公開表示で使用）。`--json` は `outs`・`images`・`diagnostics`・`slideMaps`（各デッキの `deck`・`out`・各スライドの `slug`/`title`/`line`/`steps`/`script`/`paragraphs`）を返す |
| `dekc video [deck] [slug] [--fps N] [--root-dist]` | `dekc voice` の Timeline から `dist/<deck>.mp4`（1 枚指定時は `.cache/video/<slug>.mp4`）と `.vtt`・`.chapters.txt`・`.credits.txt` を書き出す（`--fps` 既定 30） |
| `dekc pptx [deck] [--root-dist] [--public]` | `dist/<deck>.pptx` を書き出す（`##` 1 つが最終ビートの 1 枚、台本は発表者ノート）。単色・実線・角丸の矩形を図形、画像・`<canvas>`・`<svg>` を個別画像にして内包要素とグループ化、図形内文字を段落・それ以外をブロックごとのテキストボックスにし、ブラウザの折り返し位置で改行する。スライド見出しはタイトルに設定し、`::before`/`::after` の文字も出力して、残りを 2 倍解像度の背面画像上に配置（背面画像に残る要素を覆う矩形は背面側へ残す）。テーマトークンと単純背景は PowerPoint 側へ変換。何も取り出せなかったスライド名を出力し、`--public` でノートからト書き・コメントを除外。フォントは埋め込まず名前指定し、ブラウザの文字詰めを字間として記録する（[PPTX](/ja/guide/present#pptx)参照）。動かないスライドスクリプトがあると停止。`--json` は `outs` を返す。Playwright 必須 |
| `dekc pptx [deck] spec [--public]` | 編集できる PPTX をエージェントが再構築するための素材をデッキの `.cache/pptx/` に出力する。`dekc pptx` の出力を JSON 化した `deck.pptx.json` とスキーマ、各スライドの要素を読み順に位置・塗り・文字・ショット・ノート付きで並べた `spec.json`、図形化できない部分を文字抜きで切り出した `parts/` を書き出す（[編集するために作り直す](/ja/guide/present#編集するために作り直す)参照）。`--json` は `spec`・`start`・`slides`・`parts` を返す。Playwright 必須 |
| `dekc pptx [deck] --from <file> [--shot] [--root-dist]` | 編集済みの JSON から `dist/<deck>.pptx` を生成し、`spec.json` と突き合わせて検証する（error：`pptx-slides`・`pptx-title`・`pptx-text`・`pptx-bounds`、warning：`pptx-place`・`pptx-fit`・`pptx-picture`・`pptx-lines`・`pptx-notes`）。`spec.json` がないか古い場合は `skipped` で通知。`--shot` は macOS の Quick Look で各スライドを描画し、ブラウザのスクリーンショットとの差分画像および差分値 `difference` を `shots` として返す。`--json` は `outs`・`diagnostics`・`skipped`・`shots` を返す |
| `dekc pdf [deck] [--root-dist]` | 全スライド最終ビートの `dist/<deck>.pdf` を書き出す。2 倍解像度の画像（PNG、写真中心なら JPEG）に選択・検索・コピー可能な透明文字を重ね、ビューア間の表示差を防ぐ。動かないスライドスクリプトがあると `video` 同様エラーで停止 |

## 公開

`dekc pub` はトークを [dek.pub](/ja/guide/publish) へ公開・管理するコマンド群です。接続先は `https://dek.pub`、または `--server <url>` / `DEK_PUB_SERVER` で指定したサーバー（HTTPS またはローカルホストの平文 HTTP のみ）。認証には `dekc pub login` で保存した API キーか、対象サーバー向けの `DEK_TOKEN` を使います。タイムアウトは通常 30 秒・アップロード 10 分で、超過時は `--server` を示す hint 付きで失敗します。サーバーからのエラーはそのまま出力し、未知のレスポンスフィールドは無視します。他人が書いたコメント本文には `--json` で外部由来である旨の印が付きます。

| コマンド | 用途 |
| --- | --- |
| `dekc pub <subcommand>` | 単独実行はエラーになりサブコマンド一覧を表示 |
| `dekc pub login [--server <url>]` | OAuth デバイスフローでサインインし、発行された API キーを OS キーチェーン（なければモード 0600 の `~/.config/dek/credentials.json`）へ保存。テキスト出力では URL とコードを標準エラーに出して承認を待機。`--json` では 1 回目で `{ "status": "pending", "url", "code", "expiresAt", "next" }` を即返却し、コードを保存して 2 回目の実行で最長 1 分待機（承認されれば `{ "status": "signed-in", "me", "stored" }`、未承認なら同じ pending 応答）。中断しても期限内は同じコードで待機を再開でき、拒否・期限切れ・エラー時は破棄して再実行を案内。対象サーバー向けの `DEK_TOKEN` がある場合はそちらが優先される旨を `warning` で通知 |
| `dekc pub logout [--all] [--server <url>]` | 保存済みキーをサーバーで失効させて手元から削除（サーバー未認識・到達不能時は `revoked: false` と `reason` を返しつつ手元からは削除。`DEK_TOKEN` には触れない）。`--all` 指定時は手元のキー（`DEK_TOKEN` または保存済みキー）を使ってアカウントの全マシン・CI のキーを一括失効させ `revokedKeys` を返す（サーバー側で失効できなかった場合は再試行できるようキーを残して失敗） |
| `dekc pub whoami [--server <url>]` | 現在のサインインアカウントとキーの出どころ（`key`: `env` / `keychain` / `file`）を表示 |
| `dekc pub publish [deck] [--message <text>] [--slug <slug>] [--server <url>]` | 描画系を除く `dekc lint` を実行し、error があれば何も送らず `"ok": false`・`"published": false`・終了コード 1 で停止。500 文字超の `title` や 2000 文字超の `description`・`--message` も送信前に拒否。続けて `.cache/pub/` へ 3 通り（台本全文入りの `full.html` ※アップロードのみ・現状未配信、公開台本用 `public.html`、台本なし `bare.html`）をビルドし、Playwright があれば各スライド最終ビートと 1 枚目プレビュー画像を撮影（なければ `skipped` に `shots`）。`dist/`・`.cache/`・ドットファイルを除いたソースと `effective-config.json` を決定的な `source.tar` にまとめる。`pub:` 未設定時は新規デッキを作成し（slug は `--slug`、フォルダ名小文字、または `deck-` + 16 進 8 桁。既存重複時は拒否）、frontmatter へ `pub:` を書き込んで `frontmatterWritten: true`・`changed` を返す。公開ビルドのスライドマップ・lint 件数・`.dek/renames.json` の改名履歴・`--message` とともにアップロード（合計 50 MiB 超は送信前に拒否）。公開と同時に最新版へ切り替わり旧バージョンは削除され、スレッドは新版へ引き継がれる（同時更新競合時は拒否して `dekc pub status` を案内） |
| `dekc pub share [deck] [--visibility team\|private\|link\|public] [--script shown\|hidden] [--embed on\|off] [--comments off\|signed-in] [--new-link] [--server <url>]` | 公開範囲（`team`・`private`・`link`・`public`）、台本表示、外部埋め込み、トーク下部コメント可否、および `link` 用 URL 鍵の再発行（`--new-link`）を設定。レビュー用スレッドは `--comments` によらず共有相手専用。`link` 用の `?key=` は初回設定時に生成され他範囲へ変えても維持される。指定した項目だけ更新し、無指定はエラー。`pub:` 未設定デッキでは `dekc pub publish` を案内してエラー（以下同様） |
| `dekc pub status [deck] [--server <url>]` | サーバー上のデッキ状態（URL・設定・現在のバージョン `current`）と、手元ソースの SHA-256（`local.source`）および公開済みとの一致（`local.published`）を表示 |
| `dekc pub open [deck] [--server <url>]` | サーバー上のデッキ URL をブラウザで開く（`http`/`https` かつ同一サーバーのみ。`BROWSER`、macOS の `open`、その他は `xdg-open` を使用）。`--json` では URL のみ返しブラウザは開かない |
| `dekc pub comments [deck] [--status open\|resolved\|all] [--server <url>]` | コメント一覧を取得（既定は未解決のみ）。番号（チーム限定は `T2` のように `T` 付き）、公開範囲（`team` / `shared`）、`slug`、`step`、状態（`open` / `moved` / `detached` / `resolved`）、投稿者、本文、返信、対象位置（台本なら `script.md` の `path`/`line`/`column`/`found`、スライド要素なら `slides/<slug>.html` の `path`/`found`）、および確認用 `shot` コマンドを返す |
| `dekc pub comments reply [deck] <id> <text> [--server <url>]` | 指定した ID または番号（`3`、`T2` 等）のスレッドへ返信（ID の前にデッキ名を置けばどこからでも対象指定可） |
| `dekc pub comments resolve [deck] <id> [--server <url>]` | 指定コメントを解決済みにする |
| `dekc pub comments reopen [deck] <id> [--server <url>]` | 解決済みコメントを再オープンする |
| `dekc pub grants [deck] [--server <url>]` | デッキの共有相手を古い順に表示（持ち主専用）。各項目は `id`・`who`（ハンドル、または未紐づけ・ハンドル未設定時はメールアドレス）・`role`（`view`/`comment`）・`side`（`team`/`guest`）・`createdAt` |
| `dekc pub grants add [deck] <who> [--role view\|comment] [--side team\|guest] [--server <url>]` | 1 名（ハンドルまたはメールアドレス）へ共有を追加、または既存共有の権限を更新。新規の既定は `view`・`guest`、更新時は未指定項目を維持。新規作成で招待メールを送った場合 `invited: true`（上限は全デッキ合算で 24 時間 20 通、超過時は次回 UTC 時刻の hint 付きで拒否。更新ではメール不送）。確認済みメールを持つ既存アカウント宛なら即座に紐づきハンドルで表示 |
| `dekc pub grants remove [deck] <who> [--server <url>]` | 指定相手（ハンドル・待機中アドレス・grant `id`）との共有を解除（ハンドル設定済みアカウントはハンドルで指定）。未共有の相手を指定すると `dekc pub grants` の hint 付きでエラー |
| `dekc pub delete [deck] --yes [--server <url>]` | dek.pub 上のデッキと関連データ（全バージョン・スレッド・コメント・いいね・ミュート・共有設定・画像・ビルド）を完全削除（持ち主専用）。削除後は該当 URL や API が 404 になり slug が解放される。`--yes` なしでは実行せず確認エラー。削除後に `script.md` から `pub:` を除去して `changed` に返すのでコミットする。返却値は `id`・`owner`・`slug` |
| `dekc pub takedown <talk> --yes [--server <url>]` | トーク URL（`/@handle/slug`、`?key=` 有無不問）またはデッキ ID（`d_…`）で指定したトークを削除（任意のディレクトリから実行可、ローカルファイルは不変）。`DEK_PUB_OPERATORS` の運営者（および持ち主）専用で、権限のないユーザーには 404 を返す |

`pub` やその他のサブコマンド名はデッキ名に使えません（`dekc new`・`dekc init` で拒否）。既存の `pub` というデッキを開く場合は `dekc --deck pub` を使ってください。

## ヘルプ

| コマンド | 役割 |
| --- | --- |
| `dekc help [command] [--agent]` | ヘルプを表示。コマンド指定時はその使い方とフラグ一覧、`--agent` はエージェント向け圧縮リファレンス。未知の語は `did you mean …?` 付きエラー |

## 環境変数

dek は `DEK_` で始まる環境変数を起動時のシェル環境からのみ読み込み、プロジェクト側のファイルからは読みません。`dekc` は Bun を `--no-env-file --config=/dev/null` 付きで起動するため、カレントディレクトリの `.env` や `bunfig.toml` は無効化されます。`bun ./node_modules/.bin/dekc` のように直接起動して Bun が `.env` を読み込んでしまった場合でも、`.env*` に定義された `DEK_` 変数と `NODE_TLS_REJECT_UNAUTHORIZED` をすべて無視して警告します（この起動方法では `bunfig.toml` は読まれる点に注意。[自分が書いていないプロジェクト](/ja/guide/architecture#自分が書いていないプロジェクト)を参照）。

| 変数 | 役割 |
| --- | --- |
| `DEK_ALLOW_UNSANDBOXED` | `1` にすると、sandbox が起動しない環境での Chromium 描画を許容する。`dekc shot <ref>` も警告付きで描画し、自プロジェクトのデッキでは標準エラー警告を抑止する（`--json` の `unsandboxed` は維持。常にまず sandbox 有効で試行する） |
| `DEK_FFMPEG` | `dekc video` が使う ffmpeg バイナリのパス（`PATH` より優先） |
| `DEK_GITHUB_API` | `dekc ref` が使う GitHub API のベース URL（ここにはトークンを送らない） |
| `DEK_PLAYWRIGHT` | 代替 Playwright ワーカースクリプトのパス |
| `DEK_PUB_SERVER` | `dekc pub` の接続先サーバー（`https://dek.pub` の代わり、`--server` が優先。HTTPS またはローカルホストの平文 HTTP のみ） |
| `DEK_TOKEN` | CI 向けの API キー（保存済みキーより優先）。送信先は `https://dek.pub` または `DEK_TOKEN_SERVER` のみ |
| `DEK_TOKEN_SERVER` | `DEK_TOKEN` を送信する対象サーバー（他サーバーへは送信しない） |
| `DEK_PUB_CREDENTIALS` | OS キーチェーンの代わりにキーを保存するファイルパス（所有者のみ読み書き可能なファイルのみ読み込み） |
| `BROWSER` | `dekc pub open` で使うブラウザ起動コマンド（`open` / `xdg-open` より優先） |
| `GITHUB_TOKEN` | `dekc ref` が `api.github.com` へ送るトークン（非公開リポジトリ・rate limit 緩和用） |
| `GH_TOKEN` | `GITHUB_TOKEN` 未設定時の代替 |
| `DEK_RUMDL` | rumdl バイナリのパス（`PATH`・dek 同梱先より優先） |
| `DEK_VIDEO` | 代替動画キャプチャワーカーのパス（Playwright ワーカーの代わり） |
| `DEK_VOICE_PLAY` | `0` にすると `dekc voice say` で音声を再生しない |
| `DEK_VOICE_URL` | 音声エンジンのベース URL（`voice.toml` より優先） |
| `NO_COLOR` | 設定すると出力の色付けを無効化（`FORCE_COLOR`・`CI` より優先） |
| `FORCE_COLOR` | 設定すると非端末出力でも色を付ける |
| `CI` | `NO_COLOR`・`FORCE_COLOR` 未設定時に出力の色付けを無効化 |
