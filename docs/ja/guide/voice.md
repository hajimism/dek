---
description: '音声合成と動画生成はオプトイン。Cue、Timeline、リハーサル、タイミング調整、MP4 書き出し。'
---

# 声と動画

音声機能はオプトインです。`voice/` ディレクトリを置いたデッキでは、ローカルの音声合成エンジンで台本を読み上げさせ、その音声に合わせてリハーサルしたり、MP4 動画を書き出したりできます。`voice/` を持たないデッキには一切影響せず、lint がエラーになる条件も変わりません。

音声も動画も台本から生成される派生物であり、台本側に音声や動画向けの記述を混ぜる必要はありません。

```
script.md → Deck → Cue → Synth → Timeline → schedule
                                      ├→ rehearse  （ブラウザが自動進行）
                                      └→ video     （フレーム → ffmpeg）
```

## 喋りになるのは段落だけ

```bash
dekc cues
```

各ビートで読み上げられる Cue の一覧を出力します。音声エンジンは不要です。引用・リスト・コード・表は除外され、インラインの強調・リンク・コードスパンは装飾を外したプレーンテキストに変換されます。画面要素（リストや表など）はあるのに読み上げる段落がないビートは、Cue とあわせて `DEK042` として警告されるため、台本を書いている段階で気づけます。

## セットアップ

`dek.toml` に `[voice]` テーブルを書いておくと、`dekc new` で新しいデッキを作るときに `voice/voice.toml` としてコピーされます。既存のデッキに音声を追加したい場合は、直接ファイルを作成してください。

```toml
# decks/<deck>/voice/voice.toml
engine  = "voicevox"
speaker = "ずんだもん/ノーマル"
speed   = 1
pause   = { sentence = 350, beat = 700 }
```

`dekc voice` の実行には起動中の VOICEVOX 互換エンジンが必要です。一方、`rehearse` と `video` に必要なのは `dekc voice` が生成した Timeline ファイルだけです。エンジンが見つからない場合は音声を必要とするコマンドだけが失敗し、導入手順の hint が表示されます。接続できても応答がない場合はタイムアウトします（話者一覧・バージョン取得は 10 秒、文の読み取得は 60 秒、音声合成は 5 分）。

- **VOICEVOX**（ポート 50021）：[voicevox.hiroshiba.jp](https://voicevox.hiroshiba.jp/) または `docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest`
- **AivisSpeech**（ポート 10101、`engine = "aivis"`）：[aivis-project.com](https://aivis-project.com/) または `docker run --rm -p 127.0.0.1:10101:10101 ghcr.io/aivis-project/aivisspeech-engine:cpu-latest`
- **COEIROINK / SHAREVOX**：エンジン名で自動認識します。
- 別のアドレスで動いている互換エンジンを使う場合は、`engine` にベース URL を書くか環境変数 `DEK_VOICE_URL` を設定します。

## 合成

```bash
dekc voice
dekc voice speakers
dekc voice say "こんにちは"
dekc voice dict add dek デック
dekc voice pin
```

`dekc voice` は変更のあった文だけを合成し、結合音声・文ごとのキャッシュ・`timeline.json` を `.cache/voice/` に出力します（開発サーバーも保存時に同じ処理を実行します）。`voice/dict.toml` に未登録の ASCII 単語があると `DEK040`（警告）が出るため、`dekc voice dict add` で読みを登録してください。

`dekc voice pin` はマスター音声と Timeline を `voice/pin/` に固定します。キャッシュを消しても残る持ち運び可能なスナップショットです。pin がある間、`dekc voice` と開発サーバーは再合成せず pin から復元するため、台本や `voice.toml` を修正しても音声は変わりません。合成し直したいときは `voice/pin/` を削除してください。

読みのカナと各文の長さは機械可読なデータとして出力されます。dek はクラウド TTS を既定にはしません。

## リハーサル

```bash
dekc rehearse
```

Timeline を時計代わりにして開発サーバーを起動し、音声の進行に合わせてブラウザが自動でビートを送ります。録画はしません。`Space` で再生と一時停止、矢印キーや `dekc goto` でシークすると音声も追従します。手書きの `timeline.json` を用意すれば、音声エンジンなしでもリハーサルできます。

## 動画

```bash
dekc video
dekc video architecture
dekc video --fps 30 --root-dist
```

デッキ全体は `dist/<deck>.mp4`（`--root-dist` 指定時は `<root>/dist/<deck>.mp4`）、1 スライドだけ指定した場合は `.cache/video/<slug>.mp4` に書き出されます。Playwright・ffmpeg・Timeline が必要で、Timeline がまだない場合は先に `dekc voice` を実行するよう hint が出ます。MP4 とあわせて、字幕の `.vtt`、チャプター一覧の `.chapters.txt`、話者クレジットの `.credits.txt` も出力されます（クレジットは映像には焼き込みません）。

書き出しにかかる時間はトークの再生時間とは比例しません。静止している間は 1 フレームを使い回し、遷移やアニメーションの区間だけフレームを生成します。

Timeline が存在すると、`dekc ls` は字数見積もりの隣にナレーションの実尺を並べて表示し、`duration` の持ち時間から大きく外れている場合は `DEK041`（警告）を出します。台本に無音時間を書く記法はありません。段落のないビートは遷移と `pause.beat` だけを通過します。細かな間合いは次の `voice.toml` で調整します。

## タイミング

リハーサルと動画は共通のタイムスケジュールで動きます。画面切り替えは第一声より `lead` ミリ秒（既定 300）先行して始まり、声が届くころには遷移が落ち着く仕組みです（直前のビートより長い `lead` を指定しても、前の切り替えより先には出ません）。それでも切り替えが早い・遅いと感じる箇所は、台本を変えずに `voice/voice.toml` でピンポイントに調整できます。

```toml
lead = 300                  # デッキ全体

[beats.order]               # スライド全体
lead = 600                  # スライドが出る前
pause = 1200                # 最終ビートの後

[beats."order/what"]        # 1 ビート単位。id・1 始まりの番号（"order/2"）・表示直後の "order/0" が使える
pause = 1500                # 直後の無音。pause.beat を上書き
```

キーの書式はスライド単位が `slug`、ビート単位が `slug/beat-id` または `slug/2`（URL ハッシュと同じ 1 始まり）です。スライド単位のキーでは、`lead` がそのスライドの表示直前（最初の `###` より前の段落を喋る前）に、`pause` がそのスライドの最終ビート後に効きます。ビート単位のキーはスライド単位より優先されます。`dekc mv` でスライドを改名すると対応するキーも自動で書き換わります。存在しない対象を指すキーは `DEK043` 警告になります。開発サーバーは `voice.toml` を保存するたびにキャッシュ音声からスケジュールを組み直し、`dekc voice pin` は音声と一緒にタイミングも固定します。

## 日常の 4 手

```bash
$EDITOR script.md
dekc
dekc rehearse
dekc video
```

ライブ発表だけなら、[はじめる](./getting-started)の 3 手で完結します。

## 次

エージェントにスライドを書かせ、検証し、直させる → [AI エージェントと作る](./ai)
