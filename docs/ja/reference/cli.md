---
description: 'コマンド、フラグ、環境変数。'
---

# CLI

`bunx @hajimism/dek init` でプロジェクトを作り、その中で `bun add -d @hajimism/dek` と dek を入れます。[はじめる](/ja/guide/getting-started)を参照してください。以下の例では `dekc` と書きますが、実体はそのプロジェクトの中での `bunx dekc`、プロジェクトの外なら `bunx @hajimism/dek` です。`dek` と打たないでください。`bunx dek` は npm の無関係な `dek` を動かします。

## 規約

- **スコープは実行場所で決まる。** プロジェクト直下なら全デッキ、デッキの中ならそのデッキ。どこからでも、最初の引数か `--deck <name>` でデッキを指定できます。たとえば `dekc lint why-dek`、`dekc show why-dek intro`、`dek why-dek` です。詳細は[プロジェクトとデッキ](/ja/guide/structure#実行場所がスコープを決める)。
- **結果を返すコマンドは `--json` を受け付け、外側の形は共通。** 成功は `{ "ok": true, ... }`。失敗は `{ "ok": false, "error": { "message", "hint", "path", "line" }, ... }` で終了コード 1。コマンドが実行できなかった場合も、`lint` や `check` が error を見つけた場合も同じです。`hint` は dek が次の一手を知っていれば、`path` と `line` は失敗に場所があれば付きます。診断を返すコマンド（`lint`、`check`、`build`、`ls`、`cues`）は成否に関わらず `diagnostics` を持つので、読み手は `ok` で分岐し、`error` を読み、診断を読みます。起動し続ける `dekc` と `dekc rehearse` は `--json` を取りません。[JSON の約束](/ja/guide/ai#json-の約束)を参照してください。
- **各コマンドの形は JSON Schema。** [`cli.schema.json`](https://hajimism.github.io/dek/cli.schema.json) で公開しており、`$defs` にコマンドごとの定義があります。
- **形はまだ固まっていない。** dek が 0.x のあいだは、`--json` の形とルール ID がリリース間で変わることがあります。ルール ID を別のルールに使い回すことはありません。
- **診断は SARIF。** `dekc lint --format sarif`。URI は `file://`、位置は行と列、hint・slug・data は `properties` に入り、飛ばしたチェックは tool execution notification になります。既定は ESLint 風のテキスト `path:line:column: id message` です。
- **失敗になるのは error だけ。** 各診断は `severity` を持ちます。error が残っていれば `lint` と `check` は `"ok": false` と終了コード 1 を返し、warning だけなら終了コード 0 です。
- **`init` と `sync` はあなたの作業を上書きしない。** 足りないものを作り、余ったものを警告します。sync が書き直したり消したりするスライドは、誰も手を入れていない骨格だけです。元になった台本が変われば書き直し、セクションがなくなって横にスタイルシートもスクリプトもなければ消します。`AGENTS.md` で dek が持つのは `<!-- dek:begin … -->` から `<!-- dek:end -->` までのブロックだけです。リネームもしません。
- **すべてのエラーが hint を持つ。** hint は次に叩くコマンドを示します。直し方が決まっている診断にも hint が付きます。`data-step` に使える beat id、スライドで使えるクラス、リモート画像の置き先の `assets/` パスなどです。
- **ソースツリー内のパスは、テキストでも `--json` でも実行場所からの相対パス。** 診断、エラー、`init`・`new`・`sync` が作ったファイルが対象です。スクリーンショットやビルドのように dek が書き出す成果物は絶対パスのまま。SARIF は絶対 URI のままです。
- **実行しなかったチェックは `"skipped"` に並びます。** 各要素は `check`、`reason`、実行する方法があれば `hint` を持ちます。Playwright がない `dekc check` は `visual` を、`voice/` のないデッキでの `dekc check --voice` は `voice` を、rumdl がない `dekc lint` は `rumdl` を、URL か Playwright がない `dekc build` は `preview`（リンクプレビュー画像）を、ref に対する `dekc ls` は `lint` を飛ばします。テキストでは `<check>: skipped (<reason>)` と出て、hint が `help:` 行に続きます。`lint`、`check`、`build` はこれを標準エラーに出すので、標準出力には結果だけが残ります。すべて実行できたときはこのフィールド自体がありません。
- **デッキごとにファイルを書くコマンドはリストを返す。** `build` と `pdf` は、1 デッキでも対象のデッキごとのパスを `outs` で返します。
- **ref は読むだけで、書き換えない。** `ls`・`show`・`theme`・`shot` はデッキの代わりに ref 名（`owner/repo/deck`）を受け取ります。それ以外のコマンドは ref を受け取りません。[ref](#ref) を参照してください。
- **ヘルプはコマンドごとに出る。** `dekc help <command>`、`dekc <command> --help`、`-h` で、そのコマンドの使い方、やること、受け付けるフラグをすべて表示します。`dekc --version`（`-v`）はバージョンを表示します。コマンド名やデッキ名を打ち間違えると `did you mean …?` で候補を示します。
- **フラグはコマンドごとに確かめる。** `--json`、`--help`、`--version` はどこでも使えます。それ以外のフラグは受け付けるコマンドでだけ使え、`--deck` は `new`・`ref`・`help` 以外のすべてで使えます。綴りを間違えたフラグや別のコマンドのフラグは知らないうちに無視されることはなく、エラーになります。hint にはそのコマンドが受け付けるフラグと `dekc help <command>` が並びます。値も何かを実行する前に確かめます。`--port` は 1 から 65535 の整数、`--fps` は 0 より大きい数、`--accent` は 0 以上の整数、`--format` は `sarif` だけを受け付け、それ以外は空の値も含めて `invalid --<flag> "<value>"` になり、hint にそのフラグが受け付ける値が出ます。
- **引数もコマンドごとに確かめる。** 足りない引数は `missing <slug> for dekc show`、コマンドが受け付ける数を超えた引数は `unexpected argument "extra" for dekc ls` になり、どちらも hint にそのコマンドの使い方と `dekc help <command>` が出ます。サブコマンドを打ち間違えると `did you mean …?` で候補を示します。`dekc voice speakr` なら `dekc voice speakers` です。

## 開発

| コマンド | 役割 |
| --- | --- |
| `dekc [deck] [--visual] [--port N] [--remote]` | 開発サーバを起動。起動時と保存のたびの sync、ライブリロード、保存時 lint、発表者ビュー。`127.0.0.1` と `localhost` でだけ応答し、別オリジンからの操作（WebSocket、`goto`）は拒否する。`--visual` で保存時にはみ出しとコントラストも測る。`--port` でポートを固定する。省くと空いているポートを OS が選ぶ。Ctrl-C のほか、起動したプロセスが終了したときにも止まるので、ポートを握ったサーバが残らない |
| `dekc --remote` | LAN に公開。発表者ビュー、`goto`、`current`、音声のタイムラインとオーディオ、配信される診断は、起動のたびに dek が作って表示する 10 文字のパスワードが必要。ターミナルではその下の QR コードでスマホから発表者ビューを開ける（1 回だけ、5 分以内。Enter で新しいコード） |
| `dekc rehearse [deck] [slug] [--remote]` | Timeline に沿って自走。何も録画しない。`--remote` を付けると `dekc --remote` と同じく LAN に公開する |

## プロジェクト

| コマンド | 役割 |
| --- | --- |
| `dekc init [dir] [--deck NAME]` | `dir`（既定はカレント）にプロジェクトを作る。最初のデッキも作れる。`dek.toml`、`theme.css`、`.gitignore`、`.rumdl.toml`、`tsconfig.json`、`assets/`、`decks/`、`AGENTS.md`、`.dek/schema.json`、`.dek/slide.d.ts` を書く。最初のデッキは短いお手本の台本と骨格スライド付きで作るので、そのまま lint を通る。台本を自分のものに書き換えれば、手付かずのお手本の骨格は `dekc sync` が消す。既にあるものは上書きしない。あるファイルは残し、内容が違えば残したと表示する（`--json` では `created` と `kept`）。ただし dek 自身のファイルは最新にし、更新したと表示する（`updated`）。既にある `AGENTS.md` は、書いた内容を残したまま、sync と同じく dek のブロックを足す。既にある `theme.css` も残し、どのデッキもそれをコピーする。そこにどのデッキにも要るトークンが欠けていれば、init は最初の lint がそれを `DEK015` として報告する前に、標準エラーに挙げる（`--json` では `missingTokens`）。`DEK015` の hint は dek 自身のテーマが使う値を示す。入力はすべて書き込む前に確かめる。別のプロジェクトの中では実行を断るので、そこでは `dekc new` でデッキを足す。次に打つコマンドも表示し（`--json` では `next`）、プロジェクトに dek が入るまでは `bun add -d @hajimism/dek` も含める |
| `dekc new <name> [--theme-from DECK]` | デッキを追加。プロジェクトの `theme.css`、または指定デッキのものをコピーし、骨格スライドを作る。そのまま lint を通る。sync と同じく dek 自身のファイルを更新し、更新したものを一覧する（`--json` では `updated`）。次に打つコマンドも表示する（`--json` では `next`） |
| `dekc ls [deck]` | デッキ一覧、または 1 つの概要。セクション数、枚数、診断、予算、見積もり、Timeline があれば実尺。診断は rumdl を除いた dek 自身のルールの結果。一覧では各デッキの指摘をその行に、プロジェクトの指摘（`dek.toml`）を `project` 行と `--json` の最上位の `diagnostics` に 1 回だけ数える |

## ref

ref は、見本として読むために `dek.toml` の `[refs]` に固定した、他人のデッキです。`refs/` にある実体は gitignore されます。実体が無いときや別のコミットにあるときは、次に読むときに固定したコミットを取り直します。公開リポジトリならトークンは要りません。非公開なら `GITHUB_TOKEN` を設定するか、`gh auth login` でサインインしてください。

| コマンド | 役割 |
| --- | --- |
| `dekc ref <owner/repo/deck>[@rev]` | ref を既定のブランチ、または `@` の後の tag・branch・sha に固定して、実体を取得する。デッキのフォルダを指す GitHub のリンクも渡せる。もう一度実行すると最新に固定し直す。`--json` は `rev`・`from`・`changed` を返す。リポジトリに LICENSE が無ければ警告する |
| `dekc ref` | 固定した ref の一覧。rev、タイトル、枚数、取得していないもの |
| `dekc ref rm <ref>` | 固定と実体を消す |
| `dekc ls <ref>` | ref の概要。尺は ref 自身の話速で計算する。`skipped` に `lint` を入れる（ref は直す対象ではないため） |
| `dekc show <ref> <slug>` | 自分のスライドと同じ内容に加えて、`ref`（名前、rev、実体のディレクトリ、LICENSE ファイル）を返す |
| `dekc theme <ref>`、`dekc shot <ref> <slug>` | ref のテーマと、1枚のスクリーンショット |

## スライド

| コマンド | 役割 |
| --- | --- |
| `dekc show [deck] <slug>` | 1枚のスライドを作っているものを、ファイルごとに見出しを付けてまとめて出力。`script.md` に書かれたとおりのセクション（ビートの見出しと `{#id}` を含む）、`slides/<slug>.html`・`.css`・`.ts`、デッキの `theme.css` のうちそのスライドが使うルール（たどれるトークンと `@keyframes` だけを含む）、参照している assets。そのスライドのルールとは、クラス・レイアウト・必要とする要素と属性がすべてスライドのマークアップにあるもの。リストも `data-step` もない枚には `.slide ul` もビートのルールも出ない。`slides/<slug>.ts` があると、その `draw` が要素を足しうるので、`.slide` の下の要素と属性のルールはすべて残す。ファイルがなければ `null`。プロジェクトの外を指すシンボリックリンクは、`dekc build` と同じくエラー。`--json` では、`beats` にセクションのビートが順に入り、それぞれ `title`、`line`、id があれば `id` を持つ。`data-step` が指すのはこれ |
| `dekc theme [deck] [layout]` | デッキ自身の `theme.css` が定義するレイアウト・クラス・トークンを一覧する。クラスはマークアップで使えるもので、`max_classes` が数えるもの。プレイヤーが付ける `is-current` と `is-shown` は状態クラスとして別に並べる（`--json` では `stateClasses`）。CSS で選ぶためのもので、マークアップには書かない（`DEK010`）。トークンは素の `.slide` ルールが設定するもの、つまりどのスライドからも `var()` で使えるもの。レイアウトを指定すると、`slides/<id>.html` にそのまま貼れる HTML 例を出力する |
| `dekc check [deck] <slug> [--shot] [--voice]` | 1 枚を lint。その枚のスコープの指摘だけを返し、Playwright があれば描画系ルールも含む。デッキ（`theme.css`、フロントマター、尺）やプロジェクトについての指摘は `dekc lint` が報告する。[スコープ](/ja/reference/lint#スコープ)を参照。`--shot` はスクリーンショットを書いてパスを返す。Playwright があれば、最終ビートでその枚が枠をどれだけ埋めているかを `fill` に返す。`coverage` は中身が覆う枠の割合、`box` はそれを収める最小の箱、`rows` と `columns` は枠を上から下、左から右に 10 等分したそれぞれの割合で、どれも 0 から 1。数えるのは聞き手が読むか見るもの、つまり文字の行、絵（画像、SVG、動画、canvas、`url()` の背景画像）、そしてグラフの棒や色見本のように何も入れていない塗った箱。カードや窓のように中身を入れた塗った箱は、中身の分だけを数えるので、上半分に文字を置いたカードは下半分が空と出る。`aria-hidden` の付いた装飾も、聞き手には場所を取って見えるので数える。`::before` と `::after` の文字、そのビートでまだ出ていないものは数えない。判断には `rows`・`columns`・`box` を使い、空いた帯は 0 の並びとして読む。`coverage` だけでは判断できない。大きな文字の章扉と、文字の詰まったスライドが同じ値になることがある。テキストの出力には、空いた帯を、端の余白か中身の途中の空きかを分けて書く。`--voice` はカナと尺を返す。`voice/` のないデッキでは `skipped` に `voice` を設定方法つきで入れ、残りのチェックは実行する |
| `dekc shot [deck] [slug] [--step ID\|N]` | 1 枚、または全枚のスクリーンショット。既定は最終ビート。`--step 0` はビートに入る前、枚が出たところ。ファイルは `.cache/shots/<slug>~<step>.<hash>.png`。`<step>` は撮ったビートの id か番号（既定は最終ビート）で、`--step hook`・`--step 1`・既定が同じビートを指すなら 1 つのファイルになる。hash は描画内容から決まり、テーマや HTML が変われば別パスになり、古い画像は消える。変わっていないスライドは撮り直さない |
| `dekc shot [deck] --sheet` | 全枚を最終ビートで撮り、コンタクトシートに並べる。`.cache/shots/sheets/<hash>/sheet-<n>.png` に書く。タイルは、デッキ全体が 1 枚に収まる範囲で最大の大きさにする。1 枚は一辺 1568 px 以下・115 万画素以下で、ビジョンモデルが縮小せずに読める大きさ。長いデッキは複数枚になる。タイルは各枚のショットそのものなので、変更のないデッキではブラウザを起動しない。`--json` は各ショットも返す |
| `dekc shot [deck] <slug> --motion [--step ID\|N]` | その枚が出たところと各ビートを 1 行ずつ並べる。各行は直前のビートまたは前の枚から再生し、その移動で始まったもの全体の 0・25・50・75% と、終わり（`dekc shot` の静止画と同じ）で止める。`.cache/shots/motion/<slug>.<hash>/` に、シートを `sheet-<n>.png`、コマを `frames/` の下に書く。`--json` では、`motion` に各ビートが順に入り、それぞれ `step` と `frames` を持つ。各コマは `path` と `ms` を持ち、落ち着いた終わりのコマには `end: true` が付く。シートは `sheets` に入り、`shots` は空。`--step` はそのビートだけを再生する |
| `dekc shot [deck] <a> --to <b> [--at 0..1]` | `a` の最終ビートから `b` へ移る View Transition を、遷移の長さに対する `--at`（既定 0.5）で止めた 1 フレーム。`b` の入りのアニメーションは `--at 1` でもまだ動いていることがあり、それは `--motion` で見る。`.cache/shots/<a>~<b>~<at>.<hash>.png` に書く。`--step` とは併用できない |
| `dekc mv [deck] <old> <new>` | セクション id、HTML ファイルと `data-slug`、あれば `.css` と `.ts`、`voice/voice.toml` のキーを改名。見出しの文言は触らない。宛先がひとつでも既にあれば拒否し、すべて変わるかどれも変わらないかのどちらか |
| `dekc mv [deck] <slug> --before\|--after <slug>` | `script.md` の中でセクションを並べ替える |
| `dekc goto [deck] <slug>` | 開いているブラウザを飛ばす。開発サーバが必要。`--json` の `viewers` はそのデッキを表示しているページの数。0 のときは、次に開いたページがその位置に着き、そのことを標準エラーで伝える |
| `dekc current [deck]` | いま表示中の枚を出力。開発サーバが必要。`viewers` は表示しているページの数。0 のときは何も表示されておらず、出力した枚は次に開くページが着く位置で、そのことを標準エラーで伝える |
| `dekc marks [deck]` | リハーサル中に直したいと印を付けたビートを一覧する。発表者ビューで `m` を押すか、バーの印ボタンで、言いよどんだビートに印を付ける。印ごとに、`script.md` での見出しの `line`、`was`（印を付けたときのビートの文面）、`text`（いまの文面）、`status` を返す。`status` は `open`、文面が変わると `edited`、その名前のビートがなくなると `gone`。印はビートの id か、なければタイトルで追いかけるので、前にビートを足しても動かない。印は `.dek/marks.json` に保存される。印を付けるには開発サーバが必要。 |
| `dekc marks [deck] clear` | デッキの印を消す。`--json` の `cleared` は消した数。 |
| `dekc annotations [deck]` | 注釈モードでスライドの要素に書いたノートを一覧する。開発サーバのページで `a` を押すか、発表者バーの注釈ボタンを押して、直したいものをクリックして書く。ノートごとに、ページのマーカーと同じ `number`、書いたときの `step`、人が書いた `text`、そのビートを撮る `shot` コマンド、`targets` を返す。`targets` は要素ごとに、いまのファイルでの開始タグの `path`・`line`・`column`、`name`（そこに書かれたとおりのタグとクラス）、`was`（ノートを書いたときの文字）、`text`（いまの文字）、書いたときのスライド上の `box`、見つかったかどうかの `found`。`status` は、スライド自身の `slides/<id>.html`・`.css`・`.ts` が書いたときのままなら `open`、どれかが変わると `edited`（`changed` がどれかを示す）、ノートの要素が 1 つもスライドになくなるか、スライドが台本からなくなると `gone`。`edited` はスライドが変わったことを示すだけで、ノートが片付いたことは示さない。`shot` をノートと見比べること。要素は、いまのファイルに対して照合し直す。同じ位置で同じ名前と文字のもの、なければその名前と文字を持つ唯一の要素、なければ同じ位置で同じ名前のもの、なければ同じ位置で同じタグのもの（クラスが変わった場合）。見つけた位置は書き戻すので、ノートは編集をまたいで要素を追いかける。ノートは `.dek/annotations.json` に保存される。読むのに開発サーバは要らない。書くにはページが要る。 |
| `dekc annotations [deck] clear` | デッキの注釈を消す。片付いたことを人が確かめてから。`--json` の `cleared` は消した数。 |
| `dekc sync [deck]` | 足りない骨格スライドを作り、その後誰も手を入れていない骨格を書き直し、セクションがなくなった手付かずの骨格を消し（横に `slides/<id>.css` か `.ts` があれば残す）、dek 自身のファイル（`AGENTS.md` の dek のブロック、`.dek/schema.json`、`.dek/slide.d.ts`）を更新する。これらはデッキではなく、入っている dek とプロジェクトの ref に従うので、どちらかが変わった後にだけ変わる。そのとき最初に走ったコマンドが、どれであれ更新したと表示する。`.gitignore` が dek 自身のためのファイル（`.dek/server.json`、`.dek/marks.json`、`.dek/annotations.json`）を無視していなければ末尾に書き足し、更新したと表示する。`.gitignore` のないプロジェクトには作らない。手を入れたスライド、`AGENTS.md` の dek のブロックの外に書いたこと、`tsconfig.json` には触れない。セクションがなくなっても手が入っているスライドは残し、どうすればよいかと一緒に標準エラーに名前を出す。lint はそれを `DEK002` として報告する。`--json` は `created`、`updated`、`removed`、`kept` を返す |

## 成果物

| コマンド | 役割 |
| --- | --- |
| `dekc lint [deck] [--fix] [--visual] [--format sarif]` | lint。`--fix` は先に `dekc sync` を実行する。`--visual` ははみ出しとコントラストを足す |
| `dekc cues [deck]` | 喋りの Cue を `Cue[]` で出力。段落だけ。エンジン不要 |
| `dekc voice [deck]` | 変わった文を `.cache/voice/` に合成。保存時にも走る |
| `dekc voice [deck] speakers` | エンジンの話者一覧 |
| `dekc voice [deck] say <text>` | 1 文を再生 |
| `dekc voice [deck] dict add <word> <kana> [--accent N]` | `voice/dict.toml` に読みを追加。`--accent` でアクセント位置も指定する |
| `dekc voice [deck] pin` | マスター音声と `timeline.json` を `voice/pin/` にコピー |
| `dekc build [deck] [--root-dist] [--url <url>] [--public]` | HTML を 1 ファイル `decks/<deck>/dist/<deck>.html` に書く。`--root-dist` なら `<root>/dist/<deck>.html`。スライドごとの CSS とスクリプトはインライン化される。lint の結果でビルドが止まることはない。HTML のないセクションは骨格からビルドし、動かないスライドスクリプト（`DEK016`）は外して、その枚を動きなしでビルドする。dek 自身のルールが何か見つければ件数を表示し（rumdl は `dekc lint` だけが動かす）、`--json` には診断そのものが入る。ページにはリンクプレビュー用のタグが入る。`dist/` を公開する URL（`dek.toml` の `url`、または優先される `--url`）があれば、1 枚目のスライドを `og:image` 用に `dist/<deck>.png` にも書く。[Web で公開する](/ja/guide/present#web-で公開する)を参照。`--public` はリンクを知る誰もが開くページを作り、発表者ビューから台本のト書きと HTML コメントを外す。付けなければ、URL の有無にかかわらず発表者ビューに台本がすべて入る。 |
| `dekc video [deck] [slug] [--fps N] [--root-dist]` | `dekc voice` が書いた Timeline から `dist/<deck>.mp4` を焼き、`.vtt`、`.chapters.txt`、`.credits.txt` も書く。1 枚なら `.cache/video/<slug>.mp4`。`--fps` の既定は 30 |
| `dekc pptx [deck] [--root-dist] [--public]` | `dist/<deck>.pptx` を書く。`##` 1 つが最終ビートの 1 枚で、2 倍の大きさで描いた画像の上に、文字を 1 行ずつ編集できるテキストボックスとして置き、台本をノートに入れる。`--public` は `build --public` と同じく、ノートからト書きとコメントを除く。各ボックスには Chromium が描いたフォントの名前を入れ、フォントは埋め込まない。SVG、`aria-hidden` の飾り、疑似要素の文字、回した文字、影は画像に残る。動かないスライドスクリプトがあると `dekc pdf` と同じく止まる。`--json` は `outs` を返す。Playwright が必要 |
| `dekc pdf [deck] [--root-dist]` | 全枚を最終ビートで `dist/<deck>.pdf` に書く。動かないスライドスクリプトがあると `dekc video` と同じく止まる。どちらも診断を返す場所がなく、スクリプトが走らなかったかのような枚を出してしまうから |

## ヘルプ

| コマンド | 役割 |
| --- | --- |
| `dekc help [command] [--agent]` | ヘルプ。コマンドを渡すとその使い方とフラグ。`--agent` はエージェント向けの圧縮リファレンス。コマンドでない語は `dekc <word>` と同じくエラーになり、`did you mean …?` で候補を示す |

## 環境変数

| 変数 | 役割 |
| --- | --- |
| `DEK_FFMPEG` | `dekc video` が mux に使う ffmpeg バイナリのパス。`PATH` の `ffmpeg` より優先 |
| `DEK_GH` | `GITHUB_TOKEN` が無いときに `dekc ref` がトークンを尋ねる `gh` CLI のパス |
| `DEK_GITHUB_API` | `dekc ref` が取得に使う GitHub API のベース URL |
| `DEK_PLAYWRIGHT` | 代わりの Playwright ワーカースクリプトのパス |
| `GITHUB_TOKEN` | `dekc ref` が GitHub に送るトークン。非公開リポジトリと、rate limit の引き上げに使う |
| `DEK_RUMDL` | rumdl バイナリのパス。`PATH` と、dek 本体のインストール先の `node_modules/.bin` より優先 |
| `DEK_VIDEO` | 代わりの動画キャプチャワーカーのパス。Playwright ワーカーの代わりに使う |
| `DEK_VOICE_PLAY` | `0` にすると `dekc voice say` が合成した音声を再生しない |
| `DEK_VOICE_URL` | 音声エンジンのベース URL。`voice.toml` より優先 |
| `NO_COLOR` | 設定すると出力に色を付けない。`FORCE_COLOR` と `CI` より優先 |
| `FORCE_COLOR` | 設定すると端末でなくても出力に色を付ける |
| `CI` | CI サービスが設定する変数。`NO_COLOR` と `FORCE_COLOR` が無いとき、設定されていれば出力に色を付けない |
