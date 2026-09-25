# 声と動画

声はオプトインです。`voice/` ディレクトリを持つデッキは、ローカルの音声合成エンジンで台本を読み上げ、その音声に合わせてリハーサルし、MP4 を焼けます。`voice/` のないデッキには何の影響もなく、完成の定義も変わりません。

声と動画は台本の派生物です。台本はどちらも知りません。

```
script.md → Deck → Cue → Synth → Timeline → schedule
                                      ├→ rehearse  （ブラウザが自走する）
                                      └→ video     （フレーム → ffmpeg）
```

## 喋りになるのは段落だけ

```bash
dek cues
```

各ビートで喋られる Cue を出力します。エンジンは要りません。引用、リスト、コード、表は落とされ、インラインの強調、リンク、コードスパンはテキストに剥がされます。見える内容はあるのに段落がないビートは、Cue と一緒に `DEK042` として報告されるので、台本を書いている段階で気づけます。

## セットアップ

`dek.toml` に `[voice]` テーブルを書くと、`dek new` がそれを新しいデッキへ `voice/voice.toml` としてコピーします。既存のデッキには、自分でファイルを書いてください。

```toml
# decks/<deck>/voice/voice.toml
engine  = "voicevox"
speaker = "ずんだもん/ノーマル"
speed   = 1
pause   = { sentence = 350, beat = 700 }
```

`dek voice` には起動中の VOICEVOX 互換エンジンが必要です。`rehearse` と `video` に要るのは、それが書く Timeline だけです。エンジンが見つからなければ、それを必要とするコマンドだけが失敗し、hint がインストール方法を伝えます。

- **VOICEVOX**（ポート 50021）: [voicevox.hiroshiba.jp](https://voicevox.hiroshiba.jp/) か `docker run --rm -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest`
- **AivisSpeech**（ポート 10101、`engine = "aivis"`）: [aivis-project.com](https://aivis-project.com/) か `docker run --rm -p 127.0.0.1:10101:10101 ghcr.io/aivis-project/aivisspeech-engine:cpu-latest`
- COEIROINK と SHAREVOX は名前で認識します。
- 別の場所で動いている互換エンジンは、`engine` に URL を書くか `DEK_VOICE_URL` を設定します。

## 合成

```bash
dek voice
dek voice speakers
dek voice say "こんにちは"
dek voice dict add dek デック
dek voice pin
```

`dek voice` は変わった文だけを合成し、音声、文ごとのキャッシュ、`timeline.json` を `.cache/voice/` に書きます。開発サーバも保存時に同じことをします。`voice/dict.toml` にない ASCII の単語は `DEK040`（警告）で、`dict add` で読みを足します。`dek voice pin` はマスター音声と Timeline を `voice/pin/` にコピーします。キャッシュを消しても残る、持ち運べるスナップショットです。pin があるあいだ、`dek voice` と開発サーバは合成せずに pin を戻すので、台本や `voice.toml` を直しても音声には届きません。合成し直すときは `voice/pin/` を消してください。

カナと尺は機械可読です。dek はクラウド TTS を既定にしません。

## リハーサル

```bash
dek rehearse
```

Timeline を時計にして開発サーバが起動し、ブラウザが音声に合わせて時間どおりにビートを送ります。何も録画しません。`Space` で再生と停止。矢印キーと `dek goto` でシークし、音声が追従します。手書きの `timeline.json` があれば、エンジンなしでもリハーサルできます。

## 動画

```bash
dek video
dek video architecture
dek video --fps 30 --root-dist
```

デッキ全体は `dist/<deck>.mp4`、`--root-dist` なら `<root>/dist/<deck>.mp4` になります。1 枚だけなら `.cache/video/<slug>.mp4` です。Playwright、ffmpeg、Timeline が必要で、Timeline がなければ hint が先に `dek voice` を、と伝えます。MP4 と並んで、`.vtt` の字幕、`.chapters.txt` のチャプター一覧、話者を記した `.credits.txt` が書き出されます。クレジットは映像には焼き込みません。

焼く時間はトークの実時間ではありません。各ビートは静止フレーム 1 枚と、遷移に必要なぶんだけです。

Timeline があるとき、`dek ls` は字数からの見積もりの隣にナレーションの実尺を並べ、`duration` の予算から大きく外れていれば `DEK041`（警告）を出します。台本には無音の時間を表す記法はありません。段落のないビートは、遷移と `pause.beat` を通過するだけです。間合いは次の `voice.toml` で決めます。

## タイミング

リハーサルと動画は同じ予定表で動きます。画面の切り替えは第一声より `lead` ミリ秒（既定 300）先に起き、声が届くころには遷移が落ち着いています。直前のビートより長い `lead` でも、そのビートの切り替えより前には出ません。それでも早い・遅いと感じるビートは、`voice/voice.toml` でそのビートだけ調整します。台本はそのままです。

```toml
lead = 300                  # デッキ全体

[beats.order]               # スライド全体
lead = 600                  # 最初のビートの前
pause = 1200                # 最後のビートの後

[beats."order/what"]        # 1 ビート。id でも 1 始まりの位置（"order/2"）でも
pause = 1500                # 直後の無音。pause.beat の代わり
```

キーは URL のハッシュと同じ書き方です。スライドは `slug`、ビートは `slug/beat-id` か `slug/2`。スライドのキーはその枚を前後から挟みます。`lead` は最初のビートへの入りに、`pause` は最後のビートの後に効きます。ビートのキーはスライドのキーより優先されます。`dek mv` はスライドと一緒にキーも書き換えます。どこにも当たらないキーは `DEK043` です。開発サーバは保存のたびにキャッシュ済みの音声から組み直し、`dek voice pin` は音声と一緒にタイミングも固定します。

## 日常の 4 手

```bash
$EDITOR script.md
dek
dek rehearse
dek video
```

ライブ専用なら、[はじめる](./getting-started)の 3 手がすべてです。

## 次

エージェントにスライドを書かせ、確かめさせ、直させる → [AI エージェントと作る](./ai)
