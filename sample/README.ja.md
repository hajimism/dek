# dek sample

dek 自身を題材にした 3 つのサンプルデッキを収めたプロジェクトです。

- **`why-dek`**（約 12 分）：配布資料としても読める解説デッキ。各スライドで主張を文の見出しとして書き、図を添えているため、PDF だけでも内容を追えます。
- **`lightning`**（3 分）：ターミナルで発表を 1 本作ってみせるライトニングトーク。
- **`with-agents`**（6 分）：スライド制作を AI エージェントに任せるワークフローを紹介するトーク。

どのデッキも `script.md` に順序・喋る言葉・持ち時間がまとまっており、そこから dek が生成した骨格を仕上げて作っています。Playwright・rumdl・音声合成・用語チェックまで組み込んだ、実際のトーク用プロジェクトと同じフル構成です。

[English](./README.md)

## セットアップ

リポジトリを clone したうえで次を実行します。

```bash
cd sample
bun install
bun run setup          # Playwright 用の Chromium を導入
```

システム依存は 2 つありますが、どちらも任意です。未導入の場合はそれを必要とするコマンドだけが導入手順の hint 付きで失敗し、その他のコマンドはそのまま動きます。

- 動画の結合：[ffmpeg](https://ffmpeg.org/)（`brew install ffmpeg`）
- `voice` / `rehearse` / `video`：`127.0.0.1:50021` で待ち受ける [VOICEVOX](https://voicevox.hiroshiba.jp/) 互換エンジン

## 日常の操作

```bash
bun run dev            # 開発サーバー。保存のたびに再描画と lint
bun run lint:visual    # はみ出し・コントラスト・改行・揃えの計測（Playwright）
bun run build          # 各 decks/<deck>/dist/<deck>.html を生成
```

npm スクリプトは対象デッキを固定していません。プロジェクト直下で実行すれば全デッキ、デッキの中で実行すればそのデッキが対象になります。直下から 1 デッキに絞りたいときは `bun run build -- why-dek` のように名前を渡すか、`cd decks/why-dek` へ移動してください。`shot`・`cues`・`voice`・`rehearse`・`video` は 1 デッキの指定が必要なため、直下から実行する際は `-- why-dek` を付けてください。

| スクリプト | 役割 |
| --- | --- |
| `bun run lint` | `dekc lint` |
| `bun run shot` | スクリーンショット撮影 |
| `bun run pdf` | PDF 書き出し |
| `bun run cues` | 読み上げ用 Cue を `Cue[]` で出力（音声エンジン不要） |
| `bun run voice` | 変更した文だけ音声合成（VOICEVOX） |
| `bun run rehearse` | Timeline に沿った自動リハーサル |
| `bun run video` | `decks/<deck>/dist/<deck>.mp4` を生成（Playwright + ffmpeg + 音声） |

## 構成

dek 本体は `file:..` としてこのリポジトリ自身から `@hajimism/dek` を参照しており、Playwright・rumdl と並んで `sample/package.json` の `devDependencies` に入っています（通常のプロジェクトでは `dekc init` が自動で追加します）。

`dek.toml` の `[voice]` は、`dekc new` で新しいデッキを作るときにコピーされる既定値です。各デッキの実設定はそれぞれの `voice/` 配下の `voice.toml` と、ASCII 語の読み辞書 `dict.toml` にあります。音声エンジンが止まっていても開発サーバー自体はそのまま動き、音声合成だけがスキップ・失敗します。

`dek.toml` の `[plugins.words]` で `dek-words` プラグインを有効にしています。全デッキの台本とスライドを `plugins/words/words.yaml` と照合し、AI が書きがちで発表では伝わりにくい言い回し（比喩の動詞、直訳調、中身のない結び、名詞化して硬くなった表現など）を言い換え案つきで警告します。収録した語とヒントの多くは [yomiyasu](https://github.com/nanaism/yomiyasu)（MIT）から発表向けに絞って取り込んでおり、ライセンス全文は隣の `YOMIYASU-LICENSE` に置いています。発表の主題上どうしても必要な語は各デッキの `words.yaml` で許可できます。`plugins/words/plugin.json` は `dekc sync` が生成したロックファイルです。

`decks/why-dek/voice/voice.toml` にはタイミング調整の実例（デッキ全体の `lead`、`script` スライド導入時の長めの `lead`、`recap` 最終ビート後の長めの `pause`）も入れています。

3 つのデッキが共有しているのはプロジェクトだけです。それぞれが独自の `theme.css` を持ち、1 枚限定の装飾は `slides/<id>.css` へ逃がしているため、どのテーマもクラス数を抑えられています。CSS で書けない動きは `slides/<id>.ts` に `t` の関数として書いており、動画・スクリーンショット・PDF でも同じ動きや最終状態が再現されます。スライド上に載せている計測値やコマンド出力はすべて本物の実行結果です（取得元はスライドのコメントに記載）。台本やスライドを更新した際は、数値が古びないよう一緒に更新してください。

## why-dek

`decks/why-dek/` は配布資料としても読める約 12 分の解説デッキです。全スライドで主張を文の見出しにし、それぞれに図を添えているため、PDF だけでも話を追えます。従来のスライド作りで後回しになりがちな課題から入り、台本・骨格・小さなファイル・ビート・動き・実測・lint・エージェント・ref・単一 HTML ビルドまでを順に解説します。

テーマは印刷向きの紙面を意識したスイス風エディトリアルです。墨に近い黒、アクセントはコバルト一色、強調は黄色のマーカー、12 カラムグリッド、ページ番号付きの柱で構成しています。`later` の 3 枚の課題カードは `data-morph` で `order` へ、`deck` のファイルツリーの `script.md` は `script` へ移動します。`timing` は自身の `dekc ls` の見積もりと持ち時間を `data-*` 属性から描画し、`files` は自身の `slides/` の行数、`lint` は 31 ルールを 5 層に整理、`measure` は実測の `DEK030`・`DEK031`、`outputs` は実ビルドのファイルサイズを載せています。`skeleton` の画像は、骨格のままの `later` と仕上げた 1 枚を `dekc shot` で撮って `assets/` に入れたものです。

## lightning

`decks/lightning/` は、ターミナルで発表を 1 本作ってみせる 3 分のライトニングトークです。プロジェクト作成から台本執筆、保存、尺の確認、仕上げ、計測、ビルドまでを一気に駆け抜けます。テーマは暖かい黒に蛍光文字を載せた琥珀色の CRT 風で、走査線・周辺減光・にじみを疑似要素で描くことで `lint --visual` が文字のコントラストだけを正しく測れるようにしています。コマンドは `t` に合わせて打ち込まれ、ターミナル窓は `data-morph` でスライドをまたいで引き継がれ、フッターの時計は自身の `dekc ls` の見積もりに沿って 3:00 へ進みます。画面上のコマンド出力はすべて、使い捨てプロジェクトで実際に dek を実行して取得した本物です。`write` にはこのデッキ自身の `script.md`、`elapsed` には各スライドの見積もりを載せています。

## with-agents

`decks/with-agents/` は、AI コーディングエージェントにスライド制作を任せたい開発者向けの 6 分のトークです。エージェントがスライド作業でつまずく原因と、自律的にループを回すための 3 つの仕組み（数値で返す、小さなファイル、止めどきは lint が決める）を解説します。テーマはプロダクトページ風で、明るいグレーの背景に柔らかい影の白いカードと窓、パステルのステータス表示、シンタックスハイライト付きの暗いパネル、ユーザーとエージェントの吹き出しを組み合わせています。`why` の課題カードが `answer` のカードへモーフし、`loop` の円環上の点がビートごとに進みます。JSON パネルやターミナル出力もすべて実測の本物で、`dekc check --shot` の `DEK030`、hint 付きエラー、`skipped` 項目、`dekc show`、`dekc ref hajimism/dek/why-dek` で固定した ref と `timing` のスクリーンショット、さらに `annotate` では矢羽の工程表から注釈モードで実際にコピーした注釈（矢印 1 本と矢羽 2 つ、ファイルパス・行番号付き）を載せています。
