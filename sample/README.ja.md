# dek sample

dek 自身を題材にした約 12 分のデッキで、配布資料としても読めるように作っています。どのスライドも言いたいことを文で書き、それぞれの図を持っているので、PDF にすれば話を聞かなくても追えます。`script.md` を開くと、順序と喋る言葉と尺がすべてそこにあります。どのスライドも、そこから `dek` が作った骨格を仕上げたものです。Playwright、rumdl、声まで入れた、実際のトーク用プロジェクトと同じ形です。

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

`voice.toml` にはタイミングの調整例もあります。デッキ全体の `lead`、台本に注釈を付けた `anatomy` に入るときの長めの `lead`、`recap` の最後のビートの後の長めの `pause` です。

共通の見た目は `decks/why-dek/theme.css` が決めます。印刷にも向く明るいテーマで、朱はいつも台本を、藍はいつも画面を表します。`night-before` の工程図、`beats` のレーン、`rules` のルール表といった各スライドの図は、そのスライドの `slides/<id>.css` に置いているので、テーマのクラスは少ないままです。`slides/timing.ts` と `slides/one-file.ts` は、スライドに入ると同時にグラフを伸ばします。元の数値は `data-*` 属性に書いた `dek ls` の出力と `slides/` の行数です。描画は `t` だけから決まるので、動画・スクリーンショット・PDF にも同じ動きか、その最終状態が出ます。

`assets/` の画像は `dek shot` で撮ったものです。骨格のままの `night-before` と仕上げたあとの `night-before`、それにはみ出すスライドの画面で、その実際の `DEK030` の診断を `blind` に載せています。
