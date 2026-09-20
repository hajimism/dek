# dek sample

dek 自身を題材にした約 8 分のデッキです。`script.md` を開くと、順序と喋る言葉と尺がすべてそこにあります。Playwright、rumdl、声まで入れた、実際のトーク用プロジェクトと同じ形です。

[English](./README.md)

## セットアップ

リポジトリを clone したうえで:

```bash
cd sample
bun install
bun run setup          # Playwright 用の Chromium
```

システム依存は 2 つで、どちらも任意です。足りないときはそれを必要とするコマンドだけが、インストール手順の hint 付きで失敗します。CLI の他の部分は動きます。

- 動画の結合: [ffmpeg](https://ffmpeg.org/)（`brew install ffmpeg`）
- `voice` / `rehearse` / `video`: `127.0.0.1:50021` で待ち受ける [VOICEVOX](https://voicevox.hiroshiba.jp/) 互換エンジン

## 日常

```bash
bun run dev            # 開発サーバ。保存のたびに描画と lint
bun run lint:visual    # はみ出しとコントラスト（Playwright）
bun run build          # 各 decks/<deck>/dist/<deck>.html
```

スクリプトはデッキを固定しません。プロジェクト直下なら全デッキ、デッキの中ならそのデッキが対象です。直下から 1 つに絞るには名前を渡します: `bun run build -- why-dek`、または `cd decks/why-dek`。`shot`、`cues`、`voice`、`rehearse`、`video` はデッキが 1 つに決まる必要があるので、直下からは `-- why-dek` を付けてください。

| スクリプト | コマンド |
| --- | --- |
| `bun run lint` | `dek lint` |
| `bun run shot` | スクリーンショット |
| `bun run pdf` | PDF |
| `bun run cues` | 喋りの Cue を `Cue[]` で。エンジン不要 |
| `bun run voice` | 変わった文だけ合成（VOICEVOX） |
| `bun run rehearse` | Timeline に沿って自走 |
| `bun run video` | `decks/<deck>/dist/<deck>.mp4`（Playwright + ffmpeg + 声） |

## 構成

`dek` は `file:..`、つまりこのリポジトリ自身を指します。Playwright と rumdl は sample の `devDependencies` です。

`dek.toml` の `[voice]` は、`dek new` が新しいデッキへコピーする既定値です。why-dek の実際の設定は `decks/why-dek/voice/` にあり、`voice.toml` と、ASCII 語の読みを収めた `dict.toml` です。エンジンが止まっていても開発サーバは動き続けます。合成だけが失敗します。
