# dek sample

dek 自身を題材にした 3 つのデッキです。`why-dek` は約 12 分のトークで、配布資料としても読めるように作っています。どのスライドも言いたいことを文で書き、それぞれの図を持っているので、PDF にすれば話を聞かなくても追えます。`lightning` はターミナルで発表をひとつ作ってみせる 3 分のライトニングトーク、`with-agents` はスライドを AI エージェントに任せる話をする 6 分のトークです。どの `script.md` を開いても、順序と喋る言葉と尺がすべてそこにあります。どのスライドも、そこから `dek` が作った骨格を仕上げたものです。Playwright、rumdl、声まで入れた、実際のトーク用プロジェクトと同じ形です。

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

dek は `@hajimism/dek` として `file:..`、つまりこのリポジトリ自身から入り、Playwright と rumdl と並んで sample の `devDependencies` にあります。自分のプロジェクトでは代わりに `bun add -d github:hajimism/dek` で入れます。

`dek.toml` の `[voice]` は、`dek new` が新しいデッキへコピーする既定値です。各デッキの実際の設定はそれぞれの `voice/` にあり、`voice.toml` と、ASCII 語の読みを収めた `dict.toml` です。エンジンが止まっていても開発サーバは動き続けます。合成だけが失敗します。

`decks/why-dek/voice/voice.toml` にはタイミングの調整例もあります。デッキ全体の `lead`、台本に注釈を付けた `script` に入るときの長めの `lead`、`recap` の最後のビートの後の長めの `pause` です。

3 つのデッキが共有しているのはプロジェクトだけです。それぞれが自分の `theme.css` を持ち、一枚でしか使わない装飾はそのスライドの `slides/<id>.css` に置いているので、どのテーマもクラスは少ないままです。CSS で書けない動きは `slides/<id>.ts` が `t` だけから描くので、動画・スクリーンショット・PDF にも同じ動きか、その最終状態が出ます。計測値やコマンドの出力に見えるものはすべて本物で、実際に測るか実行したものです。どこから取ったかはスライドの注記に書いてあります。台本やスライドを変えると古くなるので、デッキと一緒に更新してください。

## why-dek

`decks/why-dek/` は、配布資料としても読める約 12 分の解説デッキです。どのスライドも言いたいことを文の見出しで書き、それぞれの図を持っているので、PDF にすれば話を聞かなくても追えます。いまのスライド作りで後回しになっていることから始めて、台本、骨格、小さなファイル、ビート、動き、測ること、lint、エージェント、ref、そして会場に持っていく 1 ファイルまでを順に話します。

テーマは印刷向きの紙に組んだスイス風のエディトリアルです。墨に近い黒、合図の色はコバルト一色、強調には黄色のマーカー、見える 12 カラムのグリッド、ページ番号付きの柱。`later` の 3 枚の課題カードは `data-morph` で `order` へ、`deck` のツリーの `script.md` は `script` へ運ばれます。`timing` はこのデッキ自身の `dek ls` の見積もりと持ち時間を `data-*` 属性から描き、`files` は自分の `slides/` の行数、`lint` は 31 のルールを 5 つの層に並べ、`measure` は実際の `DEK030` と `DEK031`、`outputs` はビルドした実際のサイズを載せています。`skeleton` は、骨格のままの `later` と仕上げた一枚を `dek shot` で撮った `assets/` の画像です。

## lightning

`decks/lightning/` は、ターミナルで発表をひとつ作ってみせる 3 分のライトニングトークです。プロジェクトを作り、台本を書き、保存し、尺を見て、仕上げ、測り、固めます。テーマは琥珀色の CRT で、暖かい黒に蛍光色の文字。走査線と周辺減光とにじみは疑似要素に描いているので、`lint --visual` が測るのは文字だけです。コマンドは `t` から打ち込まれ、ターミナルの窓は `data-morph` でスライドをまたいで引き継がれ、フッターの時計はこのデッキ自身の `dek ls` の見積もりで 3:00 に向かって伸びます。コマンドの出力はすべて、使い捨てのプロジェクトで実際に dek を動かしたものです。`write` にはこのデッキ自身の `script.md` を、`elapsed` には自身の各スライドの見積もりを載せています。

## with-agents

`decks/with-agents/` は、AI コーディングエージェントにスライドを任せたい開発者向けの 6 分のトークです。エージェントがスライドでつまずく理由と、ひとりでループを回せるようにする三つの約束（数字で返す、小さなファイル、lint が通れば完成）を話します。テーマはプロダクトページ風で、明るいグレーの地に、柔らかい影の白いカードと窓、パステルのステータス表示、構文色付きの暗いパネル、あなたとエージェントの吹き出し。`why` の課題カードは `answer` の約束のカードへ morph し、`loop` の輪の上の点はビートごとに進みます。JSON のパネルとターミナルはすべて、使い捨てのプロジェクトで実際に出した出力です。`dek check --shot` の `DEK030`、hint 付きのエラー、`skipped` の項目、`dek show`、それに実際に `dek ref hajimism/dek/why-dek` で固定した ref と、その `timing` スライドのスクリーンショットです。
