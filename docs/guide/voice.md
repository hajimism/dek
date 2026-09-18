# 声と動画

目標: オプトインしたデッキで、台本から声と mp4 を派生させる。

声と動画は台本の派生物。`script.md` は見た目も声も知らない。`voice/` の無いデッキでは、lint 通過 = 完成の定義は変わらない。

```
script.md → Deck → Cue → Synth → Timeline → schedule
                                      ├→ rehearse（ブラウザが自走）
                                      └→ video（フレーム → mux）
```

## 段落だけが喋り

```bash
dek cues
```

エンジンは不要。blockquote、リスト、コード、表は合成対象にならない。インラインの強調はテキストに剥がす。

## 合成

`dek.toml` に `[voice]` があるとき、`dek new` は `voice/voice.toml` をデッキへコピーする。VOICEVOX 互換のローカルエンジンが `voice` / `rehearse` / `video` に必要。未検出ならそのコマンドだけが次の一手付きで失敗する。

```bash
dek voice
dek voice speakers
dek voice say "こんにちは"
dek voice dict add dek デック
dek voice pin
```

`dek voice` は変わった文だけ再合成する。保存時にも走る。辞書にない ASCII 語は DEK040（警告）。

カナと尺は機械可読。クラウド TTS を既定にしない。

## リハーサル

```bash
dek rehearse
```

同じ開発サーバを、Timeline を時計にして自走させる。動画は焼かない。`.dek/voice/<deck>/timeline.json` があればブラウザがビートを時間どおりに送る。rehearse 中の Space は再生/停止。矢印と `dek goto` は今のビートへ音と位置を追従させる。エンジンが無くても、手書きの Timeline があれば自走を確認できる。

## 動画

```bash
dek video
dek video architecture
```

デッキ全体は `dist/<deck>.mp4`。1 枚は `.dek/video/<deck>/<slug>.mp4`。`ffmpeg` が必須。`.vtt` / `.chapters.txt` / `.credits.txt` も出す。クレジットは動画に焼き込まない。

録画はトーク尺ぶん待たない。ホールドは 1 枚、アニメーション中だけ fps。View Transitions が仮想時間に従わなければ、アニメ区間だけ実時間で撮る。

Timeline があるとき、`dek ls` は予算と実尺を並置する。大きなずれは DEK041（警告）。待ち時間の記法は台本にも設定にも作らない。本文のないビートは遷移と `pause.beat` だけ通過する。

## 日常の 4 手

```bash
$EDITOR script.md
dek
dek rehearse
dek video
```

ライブ専用なら [はじめる](./getting-started) の 3 手で終わる。

## 次

エージェントと一往復で直す → [AI と作る](./ai)
