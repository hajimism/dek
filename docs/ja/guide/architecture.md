# アーキテクチャ

いちばん重要な設計判断は、**core** を独立したモジュールにしたことです。CLI と開発サーバは同じパーサ、同じルールセット、同じプロジェクト解決を共有します。パーサが 2 つあれば必ず挙動がズレます。

```
                 ┌─────────────────┐
                 │   core (parser) │   project → Deck[]
                 │   + rules       │   Deck + slides/ → Diagnostic[]
                 └────────┬────────┘
                  ┌───────┴───────┐
                  │               │
             ┌────┴────┐    ┌─────┴─────┐
             │   CLI   │    │ dev server│
             └────┬────┘    └─────┬─────┘
                  └──── HTTP ─────┘   goto / current
```

CLI はファイルを直接扱います。ブラウザが何を表示しているかを知る、あるいは変える必要のある 2 つのコマンド、`goto` と `current` だけが、起動中の開発サーバに HTTP で問い合わせます。サーバがなければ hint 付きで失敗します。ネットワークに出るのは `dek ref` だけで、固定したコミットを GitHub から取ってきます。ref のスナップショットがなければ `ls`・`show`・`theme`・`shot` も取り直します。lint、build、sync はネットワークに出ません。

## 声と動画

声と動画は同じ core の上に、別のドライバとして載ります。core が知っているのは Cue、Timeline、スケジュールだけで、音声エンジン、ffmpeg、ブラウザはアダプタです。

```
script.md → Deck → Cue → Synth → Timeline → schedule
                                      ├→ RehearseDriver → player.go()
                                      └→ VideoDriver    → player.go() + frames → mux
```

動画の撮影はトークを実時間で再生しません。各ビートは静止フレーム 1 枚と遷移に必要なフレームだけを生むので、描画時間はトークの長さではなく動きの量に比例します。スライドのスクリプトも同じ時計に乗ります。動画モードのプレイヤーは各スクリプトを `t = 0` で止めておき、worker が `window.dekMotion` を通して同じ位置へシークします。

## 任意依存

Playwright、ffmpeg、音声エンジンは任意です。欠けているときは、それを必要とするコマンドだけが失敗し、hint が何を入れるべきかを伝えます。CLI 自体は常に起動します。

Bun の Node 互換は部分的なので、Playwright は実行時に `node_modules` から解決し、別のワーカープロセスで動かします。`DEK_PLAYWRIGHT` で代わりのワーカーを指定でき、テストはこれでブラウザなしに動いています。rumdl は `PATH`、`node_modules/.bin`、`DEK_RUMDL` の順に探します。

## エージェントの接点

CLI です。結果を返すコマンドはすべて `--json` を受け、診断は SARIF、`dek help --agent` が圧縮リファレンスです。[AI エージェントと作る](./ai)と [CLI リファレンス](/ja/reference/cli)を参照してください。
