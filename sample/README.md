# dek sample

dek 自身を題材にした約 8 分のデッキです。`script.md` を開くと、順序と喋りと尺が全部そこにあります。Playwright・rumdl・voice まで入れたトークプロジェクトの形です。

## セットアップ

リポジトリを clone したうえで:

```bash
cd sample
bun install
bun run setup          # Playwright の Chromium
```

任意のシステム依存。未検出ならそのコマンドだけが次の一手付きで失敗します。CLI 全体は起動できます。

- `video` の結合 — [ffmpeg](https://ffmpeg.org/)（`brew install ffmpeg`）
- `voice` / `rehearse` / `video` — [VOICEVOX](https://voicevox.hiroshiba.jp/) 互換エンジンを `127.0.0.1:50021` で起動

## 日常

```bash
bun run dev            # 開発サーバ。保存のたびに描画と lint
bun run lint:visual    # はみ出し・コントラスト（Playwright）
bun run build          # 各 decks/<deck>/dist/<deck>.html
```

スクリプトはデッキを固定しない。プロジェクト直下は全デッキ、デッキの中ならそのデッキ。1 つに絞るなら `bun run build -- why-dek` か `cd decks/why-dek`。`shot` / `cues` / `voice` / `rehearse` / `video` はデッキが要るので、直下なら `-- why-dek`。

| script | コマンド |
| --- | --- |
| `bun run lint` | `dek lint` |
| `bun run shot` | スクリーンショット |
| `bun run pdf` | PDF |
| `bun run cues` | 喋りの Cue[]（エンジン不要） |
| `bun run voice` | 差分合成（VOICEVOX） |
| `bun run rehearse` | Timeline に沿って自走 |
| `bun run video` | `decks/<deck>/dist/<deck>.mp4`（Playwright + ffmpeg + 声） |

## 構成

`dek` は `file:..` でこのリポジトリ自身を指します。Playwright と rumdl は sample の `devDependencies` です。

`dek.toml` の `[voice]` は `dek new` が新しいデッキへコピーする既定です。why-dek の実体は `decks/why-dek/voice/`（`voice.toml` と ASCII 語の `dict.toml`）。エンジンが止まっていても開発サーバは落ちません。合成だけが失敗します。
