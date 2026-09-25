# CLI

`bunx github:hajimism/dek init` でプロジェクトを作り、その中で `bun add -d github:hajimism/dek` と dek を入れます。[はじめる](/ja/guide/getting-started)を参照してください。以下の例では `dek` と書きますが、実体はそのプロジェクトの中での `bunx dek`、入れる前なら `bunx github:hajimism/dek` です。dek を入れていない場所での `bunx dek` は、npm の無関係な `dek` を動かします。

## 規約

- **スコープは実行場所で決まる。** プロジェクト直下なら全デッキ、デッキの中ならそのデッキ。どこからでも、最初の引数か `--deck <name>` でデッキを指定できます: `dek lint why-dek`、`dek show why-dek intro`、`dek why-dek`。詳細は[プロジェクトとデッキ](/ja/guide/structure#実行場所がスコープを決める)。
- **結果を返すコマンドは `--json` を受け付け、包みは一つ。** 成功は `{ "ok": true, ... }`。失敗は `{ "ok": false, "error": { "message", "hint", "path", "line" }, ... }` で終了コード 1。コマンドが実行できなかった場合も、`lint` や `check` が error を見つけた場合も同じです。`hint` は dek が次の一手を知っていれば、`path` と `line` は失敗に場所があれば付きます。診断を返すコマンド（`lint`、`check`、`build`、`ls`、`cues`）は成否に関わらず `diagnostics` を持つので、読み手は `ok` で分岐し、`error` を読み、診断を読みます。起動し続ける `dek` と `dek rehearse` は `--json` を取りません。[JSON の約束](/ja/guide/ai#json-の約束)を参照してください。
- **形はまだ固まっていない。** dek が 0.x のあいだは、`--json` の形とルール ID がリリース間で変わることがあります。ルール ID を別のルールに使い回すことはありません。
- **診断は SARIF。** `dek lint --format sarif`。URI は `file://`、位置は行と列、hint・slug・data は `properties` に入り、飛ばしたチェックは tool execution notification になります。既定は ESLint 風のテキスト `path:line:column: id message` です。
- **失敗になるのは error だけ。** 各診断は `severity` を持ちます。error が残っていれば `lint` と `check` は `"ok": false` と終了コード 1 を返し、warning だけなら終了コード 0 です。
- **`init` と `sync` はあなたの作業を上書きしない。** 足りないものを作り、余ったものを警告します。sync が書き直したり消したりするスライドは、誰も手を入れていない骨格だけです。元になった台本が変われば書き直し、セクションがなくなって横にスタイルシートもスクリプトもなければ消します。`AGENTS.md` で dek が持つのは `<!-- dek:begin … -->` から `<!-- dek:end -->` までのブロックだけです。リネームもしません。
- **すべてのエラーが hint を持つ。** 次に叩くコマンドを名指しします。直し方が決まっている診断にも hint が付きます。`data-step` に使える beat id、スライドで使えるクラス、リモート画像の置き先の `assets/` パスなどです。
- **ソースツリー内のパスは、テキストでも `--json` でも実行場所からの相対パス。** 診断、エラー、`init`・`new`・`sync` が作ったファイルが対象です。スクリーンショットやビルドのように dek が書き出す成果物は絶対パスのまま。SARIF は絶対 URI のままです。
- **実行しなかったチェックは `"skipped"` に並びます。** 各要素は `check`、`reason`、実行する方法があれば `hint` を持ちます。Playwright がない `dek check` は `visual` を、`voice/` のないデッキでの `dek check --voice` は `voice` を、rumdl がない `dek lint` は `rumdl` を、ref に対する `dek ls` は `lint` を飛ばします。テキストでは `<check>: skipped (<reason>)` と出て、hint が `help:` 行に続きます。すべて実行できたときはこのフィールド自体がありません。
- **デッキごとにファイルを書くコマンドはリストを返す。** `build` と `pdf` は、1 デッキでも対象のデッキごとのパスを `outs` で返します。
- **ref は読むだけで、書き換えない。** `ls`・`show`・`theme`・`shot` はデッキの代わりに ref 名（`owner/repo/deck`）を受け取ります。それ以外のコマンドは ref を受け取りません。[ref](#ref) を参照してください。
- **ヘルプはコマンドごとに出る。** `dek help <command>`、`dek <command> --help`、`-h` で、そのコマンドの使い方、やること、受け付けるフラグをすべて表示します。`dek --version`（`-v`）はバージョンを表示します。コマンド名やデッキ名を打ち間違えると `did you mean …?` で候補を示します。
- **フラグはコマンドごとに確かめる。** `--json`、`--help`、`--version` はどこでも使えます。それ以外のフラグは受け付けるコマンドでだけ使え、`--deck` は `new`・`ref`・`help` 以外のすべてで使えます。綴りを間違えたフラグや別のコマンドのフラグは黙って無視されず、エラーになります。hint にはそのコマンドが受け付けるフラグが並びます。

## 開発

| コマンド | 役割 |
| --- | --- |
| `dek [deck] [--visual] [--port N]` | 開発サーバを起動。起動時と保存のたびの sync、ライブリロード、保存時 lint、プレゼンタービュー。`127.0.0.1` と `localhost` でだけ応答し、別オリジンからの操作（WebSocket、`goto`）は拒否する。`--visual` で保存時にはみ出しとコントラストも測る。`--port` でポートを固定する。省くと空いているポートを OS が選ぶ。Ctrl-C のほか、起動したプロセスが終了したときにも止まるので、ポートを握ったサーバが残らない |
| `dek --remote [--password PWD]` | LAN に公開。プレゼンタービュー、`goto`、`current`、音声のタイムラインとオーディオ、配信される診断はパスワード必須。省くと 10 文字のパスワードを生成する |
| `dek rehearse [slug] [--remote [--password PWD]]` | Timeline に沿って自走。何も録画しない。`--remote` を付けると `dek --remote` と同じく LAN に公開する |

## プロジェクト

| コマンド | 役割 |
| --- | --- |
| `dek init [dir] [--deck NAME]` | `dir`（既定はカレント）にプロジェクトを作る。最初のデッキも作れる。`dek.toml`、`theme.css`、`.gitignore`、`.rumdl.toml`、`tsconfig.json`、`assets/`、`decks/`、`AGENTS.md`、`.dek/schema.json`、`.dek/slide.d.ts` を書く。最初のデッキは短いお手本の台本と骨格スライド付きで作るので、そのまま lint を通る。台本を自分のものに書き換えれば、手付かずのお手本の骨格は `dek sync` が消す。既にあるものは上書きしない。あるファイルは残し、内容が違えば残したと表示する（`--json` では `created` と `kept`）。既にある `AGENTS.md` は、書いた内容を残したまま、sync と同じく dek のブロックを足す。入力はすべて書き込む前に確かめる。別のプロジェクトの中では実行を断るので、そこでは `dek new` でデッキを足す。次に打つコマンドも表示し（`--json` では `next`）、プロジェクトに dek が入るまでは `bun add -d github:hajimism/dek` も含める |
| `dek new <name> [--theme-from DECK]` | デッキを追加。プロジェクトの `theme.css`、または指定デッキのものをコピーし、骨格スライドを作る。そのまま lint を通る。次に打つコマンドも表示する（`--json` では `next`） |
| `dek ls [deck]` | デッキ一覧、または 1 つの概要。セクション数、枚数、診断、予算、見積もり、Timeline があれば実尺 |

## ref

ref は、見本として読むために `dek.toml` の `[refs]` に固定した、他人のデッキです。`refs/` にある実体は gitignore されます。実体が無いときや別のコミットにあるときは、次に読むときに固定したコミットを取り直します。公開リポジトリならトークンは要りません。非公開なら `GITHUB_TOKEN` を設定するか、`gh auth login` でサインインしてください。

| コマンド | 役割 |
| --- | --- |
| `dek ref <owner/repo/deck>[@rev]` | ref を既定のブランチ、または `@` の後の tag・branch・sha に固定して、実体を取得する。デッキのフォルダを指す GitHub のリンクも渡せる。もう一度実行すると最新に固定し直す。`--json` は `rev`・`from`・`changed` を返す。リポジトリに LICENSE が無ければ警告する |
| `dek ref` | 固定した ref の一覧。rev、タイトル、枚数、取得していないもの |
| `dek ref rm <ref>` | 固定と実体を消す |
| `dek ls <ref>` | ref の概要。尺は ref 自身の話速で計算する。`skipped` に `lint` を入れる（ref は直す対象ではないため） |
| `dek show <ref> <slug>` | 自分のスライドと同じ内容に加えて、`ref`（名前、rev、実体のディレクトリ、LICENSE ファイル）を返す |
| `dek theme <ref>`、`dek shot <ref> <slug>` | ref のテーマと、1枚のスクリーンショット |

## スライド

| コマンド | 役割 |
| --- | --- |
| `dek show <slug>` | 1枚のスライドを作っているものを、ファイルごとに見出しを付けてまとめて出力。セクションの台本、`slides/<slug>.html`・`.css`・`.ts`、デッキの `theme.css` のうちそのスライドが使うルール（たどれるトークンと `@keyframes` だけを含む）、参照している assets。ファイルがなければ `null` |
| `dek theme [layout]` | デッキ自身の `theme.css` が定義するレイアウト・クラス・トークンを一覧する。レイアウトを指定すると、`slides/<id>.html` にそのまま貼れる HTML 例を出力する |
| `dek check <slug> [--shot] [--voice]` | 1 枚を lint。Playwright があれば描画系ルールも含む。`--shot` はスクリーンショットを書いてパスを返す。`--voice` はカナと尺を返す。`voice/` のないデッキでは `skipped` に `voice` を設定方法つきで入れ、残りのチェックは実行する |
| `dek shot [slug] [--step <id\|n>]` | 1 枚、または全枚のスクリーンショット。既定は最終ビート。ファイルは `.cache/shots/<slug>[-<step>].<hash>.png`。hash は描画内容から決まり、テーマや HTML が変われば別パスになり、古い画像は消える |
| `dek shot <a> --to <b> [--at 0..1]` | `a` の最終ビートから `b` へ移る View Transition を `--at`（既定 0.5）で止めた 1 フレーム。`.cache/shots/<a>-to-<b>-<at>.<hash>.png` に書く。`--step` とは併用できない |
| `dek mv <old> <new>` | セクション id、HTML ファイルと `data-slug`、あれば `.css` と `.ts`、`voice/voice.toml` のキーを改名。見出しの文言は触らない。宛先がひとつでもあれば拒否し、すべて変わるかどれも変わらないかのどちらか |
| `dek mv <slug> --before\|--after <other>` | `script.md` の中でセクションを並べ替える |
| `dek goto <slug>` | 開いているブラウザを飛ばす。開発サーバが必要 |
| `dek current` | いま表示中の枚を出力。開発サーバが必要 |
| `dek sync` | 足りない骨格スライドを作り、その後誰も手を入れていない骨格を書き直し、セクションがなくなった手付かずの骨格を消し（横に `slides/<id>.css` か `.ts` があれば残す）、`AGENTS.md` の dek のブロック、`.dek/schema.json`、`.dek/slide.d.ts` を更新する。手を入れたスライド、`AGENTS.md` の dek のブロックの外に書いたこと、`tsconfig.json` には触れない。`--json` は `created`、`updated`、`removed` を返す |

## 成果物

| コマンド | 役割 |
| --- | --- |
| `dek lint [--fix] [--visual] [--format sarif]` | lint。`--fix` は先に `dek sync` を実行する。`--visual` ははみ出しとコントラストを足す |
| `dek cues` | 喋りの Cue を `Cue[]` で出力。段落だけ。エンジン不要 |
| `dek voice` | 変わった文を `.cache/voice/` に合成。保存時にも走る |
| `dek voice speakers` | エンジンの話者一覧 |
| `dek voice say TEXT` | 1 文を再生 |
| `dek voice dict add WORD KANA [--accent N]` | `voice/dict.toml` に読みを追加。`--accent` でアクセント位置も指定する |
| `dek voice pin` | マスター音声と `timeline.json` を `voice/pin/` にコピー |
| `dek build [--root-dist] [--url <url>]` | HTML を 1 ファイル `decks/<deck>/dist/<deck>.html` に書く。`--root-dist` なら `<root>/dist/<deck>.html`。スライドごとの CSS とスクリプトはインライン化される。lint の結果でビルドが止まることはない。HTML のないセクションは骨格からビルドする。問題があれば件数を表示し、`--json` には診断そのものが入る。ページにはリンクプレビュー用のタグが入る。`dist/` を公開する URL（`dek.toml` の `url`、または優先される `--url`）があれば、1 枚目のスライドを `og:image` 用に `dist/<deck>.png` にも書く。[Web で公開する](/ja/guide/present#web-で公開する)を参照 |
| `dek video [slug] [--fps N] [--root-dist]` | `dek voice` が書いた Timeline から `dist/<deck>.mp4` を焼き、`.vtt`、`.chapters.txt`、`.credits.txt` を添える。1 枚なら `.cache/video/<slug>.mp4`。`--fps` の既定は 30 |
| `dek pdf [--root-dist]` | 全枚を最終ビートで `dist/<deck>.pdf` に書く |
| `dek help [command] [--agent]` | ヘルプ。コマンドを渡すとその使い方とフラグ。`--agent` はエージェント向けの圧縮リファレンス。コマンドでない語は `dek <word>` と同じくエラーになり、`did you mean …?` で候補を示す |

## 環境変数

| 変数 | 役割 |
| --- | --- |
| `DEK_FFMPEG` | `dek video` が mux に使う ffmpeg バイナリのパス。`PATH` の `ffmpeg` より優先 |
| `DEK_GH` | `GITHUB_TOKEN` が無いときに `dek ref` がトークンを尋ねる `gh` CLI のパス |
| `DEK_GITHUB_API` | `dek ref` が取得に使う GitHub API のベース URL |
| `DEK_PLAYWRIGHT` | 代わりの Playwright ワーカースクリプトのパス |
| `GITHUB_TOKEN` | `dek ref` が GitHub に送るトークン。非公開リポジトリと、rate limit の引き上げに使う |
| `DEK_RUMDL` | rumdl バイナリのパス。`PATH` と `node_modules/.bin` より優先 |
| `DEK_VIDEO` | 代わりの動画キャプチャワーカーのパス。Playwright ワーカーの代わりに使う |
| `DEK_VOICE_PLAY` | `0` にすると `dek voice say` が合成した音声を再生しない |
| `DEK_VOICE_URL` | 音声エンジンのベース URL。`voice.toml` より優先 |
| `NO_COLOR` | 設定すると出力に色を付けない。`FORCE_COLOR` と `CI` より優先 |
| `FORCE_COLOR` | 設定すると端末でなくても出力に色を付ける |
| `CI` | CI サービスが設定する変数。`NO_COLOR` と `FORCE_COLOR` が無いとき、設定されていれば出力に色を付けない |
