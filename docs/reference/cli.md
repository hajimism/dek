# CLI

導入は `bunx github:hajimism/dek` と `bun add github:hajimism/dek`。[はじめる](/guide/getting-started) を見る。以降の例はコマンド名を `dek` と書く。実体は `bunx dek`、まだ固定していなければ `bunx github:hajimism/dek`。

結果を出すコマンドは `--json` を受け付ける。`dek` と `dek rehearse` は起動したままなので JSON にしない。人間向けはテキスト、機械向けは JSON か SARIF。診断は `dek lint --format sarif`。

`init` と `sync` は既存ファイルを上書きしない。足りないものを骨格として作り、余ったものを警告するだけ。リネームもしない。

エラーは次の一手を hint に含む。エージェント向けの圧縮ヘルプは `dek help --agent`。

スコープは実行場所で決まる。詳細は [プロジェクト構造](/guide/structure#実行場所がスコープを決める)。どこからでもデッキ名、または `--deck <name>` でデッキを指定できる。`dek lint why-dek`、`dek show why-dek intro`、`dek why-dek`。

## 開発

| コマンド | 役割 |
| --- | --- |
| `dek [deck]` | 開発サーバ。sync・HMR・lint・プレゼンタービューを内包 |
| `dek --remote [--password PWD]` | LAN に公開。プレゼンターノートと goto/current はパスワード保護 |
| `dek rehearse [slug]` | Timeline に沿って自走。動画は焼かない |

## プロジェクト

| コマンド | 役割 |
| --- | --- |
| `dek init [dir] [--deck NAME]` | プロジェクトを作る（省略時はカレント） |
| `dek new <name> [--theme-from DECK]` | デッキを追加 |
| `dek ls [deck]` | デッキ一覧、または 1 つの概要（枚数・lint・尺・セクション） |

## スライド

| コマンド | 役割 |
| --- | --- |
| `dek show <slug>` | 台本と HTML をまとめて出す |
| `dek check <slug> [--shot] [--voice]` | 1 枚を lint。`--shot` はスクショ、`--voice` は読み |
| `dek shot [slug] [--step <id\|n>]` | スクリーンショット。既定は全要素表示の最終ステップ |
| `dek mv <old> <new>` | セクション id と HTML の改名 |
| `dek mv <slug> --before\|--after <slug>` | 並べ替え |
| `dek goto <slug>` | 開いているブラウザを飛ばす。開発サーバ必須 |
| `dek current` | 今表示している枚。開発サーバ必須 |
| `dek sync` | 足りない骨格スライドと `AGENTS.md`。上書きしない |

## 成果物

| コマンド | 役割 |
| --- | --- |
| `dek lint [--fix] [--visual] [--format sarif]` | 検証 |
| `dek cues` | Deck → Cue[]。段落だけが喋り。エンジン不要 |
| `dek voice` | 差分合成。保存時にも走る |
| `dek voice speakers` | 話者一覧 |
| `dek voice say TEXT` | 1 文を再生 |
| `dek voice dict add WORD KANA` | 辞書 |
| `dek voice pin` | TTS の master.wav + timeline.json を固定 |
| `dek build [--root-dist]` | 単一 HTML。既定は `decks/<deck>/dist/<deck>.html`。`--root-dist` はプロジェクト直下 |
| `dek video [slug] [--fps N] [--root-dist]` | 全体は `dist/<deck>.mp4`、1 枚は `.cache/video/` |
| `dek pdf [--root-dist]` | PDF。出力先は build と同じ |
| `dek help [--agent]` | ヘルプ |

フラグ `--json` と `--deck` はグローバル。デッキ名は位置引数でも渡せる。`dek build` / `dek pdf` / `dek video` は `--root-dist` でプロジェクト直下の `dist/` に書く。
