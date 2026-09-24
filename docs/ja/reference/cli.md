# CLI

導入は `bunx github:hajimism/dek`、固定は `bun add github:hajimism/dek`。[はじめる](/ja/guide/getting-started)を参照してください。以下の例では `dek` と書きますが、実体は `bunx dek`、固定前なら `bunx github:hajimism/dek` です。

## 規約

- **スコープは実行場所で決まる。** プロジェクト直下なら全デッキ、デッキの中ならそのデッキ。どこからでも、最初の引数か `--deck <name>` でデッキを指定できます: `dek lint why-dek`、`dek show why-dek intro`、`dek why-dek`。詳細は[プロジェクトとデッキ](/ja/guide/structure#実行場所がスコープを決める)。
- **結果を返すコマンドは `--json` を受け付ける。** 成功は `{ "ok": true, ... }`。失敗は `{ "ok": false, "error": { "message", "path", "line", "hint" } }` で終了コード 1。起動し続ける `dek` と `dek rehearse` は `--json` を取りません。
- **診断は SARIF。** `dek lint --format sarif`。既定は ESLint 風のテキストです。
- **`init` と `sync` は上書きしない。** 足りないものを作り、余ったものを警告します。リネームもしません。
- **すべてのエラーが hint を持つ。** 次に叩くコマンドを名指しします。
- **`--json` と `--deck` はグローバル。**

## 開発

| コマンド | 役割 |
| --- | --- |
| `dek [deck] [--visual]` | 開発サーバを起動。sync、ライブリロード、保存時 lint、プレゼンタービュー。`--visual` で保存時にはみ出しとコントラストも測る |
| `dek --remote [--password PWD]` | LAN に公開。プレゼンタービュー、`goto`、`current` はパスワード必須。省くと生成される |
| `dek rehearse [slug]` | Timeline に沿って自走。何も録画しない |

## プロジェクト

| コマンド | 役割 |
| --- | --- |
| `dek init [dir] [--deck NAME]` | `dir`（既定はカレント）にプロジェクトを作る。最初のデッキも作れる。`dek.toml`、`theme.css`、`.gitignore`、`.rumdl.toml`、`tsconfig.json`、`assets/`、`decks/`、`.dek/schema.json`、`.dek/slide.d.ts` を書く |
| `dek new <name> [--theme-from DECK]` | デッキを追加。プロジェクトの `theme.css`、または指定デッキのものをコピーする |
| `dek ls [deck]` | デッキ一覧、または 1 つの概要。セクション数、枚数、診断、予算、見積もり、Timeline があれば実尺 |

## スライド

| コマンド | 役割 |
| --- | --- |
| `dek show <slug>` | セクションの台本と HTML を出力。ファイルがなければ `html` は `null` |
| `dek check <slug> [--shot] [--voice]` | 1 枚を lint。Playwright があれば描画系ルールも含む。`--shot` はスクリーンショットを書いてパスを返す。`--voice` はカナと尺を返す |
| `dek shot [slug] [--step <id\|n>]` | 1 枚、または全枚のスクリーンショット。既定は最終ビート。ファイルは `.cache/shots/<slug>[-<step>].<hash>.png`。hash は描画内容から決まり、テーマや HTML が変われば別パスになり、古い画像は消える |
| `dek shot <a> --to <b> [--at 0..1]` | `a` の最終ビートから `b` へ移る View Transition を `--at`（既定 0.5）で止めた 1 フレーム。`.cache/shots/<a>-to-<b>-<at>.<hash>.png` に書く。`--step` とは併用できない |
| `dek mv <old> <new>` | セクション id、HTML ファイルと `data-slug`、あれば `.css` と `.ts`、`voice/voice.toml` のキーを改名。見出しの文言は触らない。宛先がひとつでもあれば拒否し、すべて変わるかどれも変わらないかのどちらか |
| `dek mv <slug> --before\|--after <other>` | `script.md` の中でセクションを並べ替える |
| `dek goto <slug>` | 開いているブラウザを飛ばす。開発サーバが必要 |
| `dek current` | いま表示中の枚を出力。開発サーバが必要 |
| `dek sync` | 足りない骨格スライドを作り、`AGENTS.md`、`.dek/schema.json`、`.dek/slide.d.ts` を更新する。スライドは上書きせず、`tsconfig.json` には触れない |

## 成果物

| コマンド | 役割 |
| --- | --- |
| `dek lint [--fix] [--visual] [--format sarif]` | lint。`--fix` は足りない骨格を作る。`--visual` ははみ出しとコントラストを足す |
| `dek cues` | 喋りの Cue を `Cue[]` で出力。段落だけ。エンジン不要 |
| `dek voice` | 変わった文を `.cache/voice/` に合成。保存時にも走る |
| `dek voice speakers` | エンジンの話者一覧 |
| `dek voice say TEXT` | 1 文を再生 |
| `dek voice dict add WORD KANA` | `voice/dict.toml` に読みを追加 |
| `dek voice pin` | マスター音声と `timeline.json` を `voice/pin/` にコピー |
| `dek build [--root-dist]` | HTML を 1 ファイル `decks/<deck>/dist/<deck>.html` に書く。`--root-dist` なら `<root>/dist/<deck>.html`。スライドごとの CSS とスクリプトはインライン化される |
| `dek video [slug] [--fps N] [--root-dist]` | `dist/<deck>.mp4` を焼き、`.vtt`、`.chapters.txt`、`.credits.txt` を添える。1 枚なら `.cache/video/<slug>.mp4` |
| `dek pdf [--root-dist]` | 全枚を最終ビートで `dist/<deck>.pdf` に書く |
| `dek help [--agent]` | ヘルプ。`--agent` はエージェント向けの圧縮リファレンス |

## 環境変数

| 変数 | 役割 |
| --- | --- |
| `DEK_PLAYWRIGHT` | 代わりの Playwright ワーカースクリプトのパス |
| `DEK_RUMDL` | rumdl バイナリのパス。`PATH` と `node_modules/.bin` より優先 |
| `DEK_VOICE_URL` | 音声エンジンのベース URL。`voice.toml` より優先 |
