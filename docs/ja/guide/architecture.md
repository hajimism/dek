---
description: 'CLI と開発サーバが共有するコア。任意の依存。'
---

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

CLI はファイルを直接扱います。ブラウザが何を表示しているかを知る、あるいは変える必要のある 2 つのコマンド、`goto` と `current` だけが、起動中の開発サーバに HTTP で問い合わせます。サーバがなければ hint 付きで失敗します。ネットワークに出るのは `dekc ref` だけで、固定したコミットを GitHub から取ってきます。ref のスナップショットがなければ `ls`・`show`・`theme`・`shot` も取り直します。lint、build、sync はネットワークに出ません。

## 声と動画

声と動画は同じ core の上に、別のドライバとして載ります。core が知っているのは Cue、Timeline、スケジュールだけで、音声エンジン、ffmpeg、ブラウザはアダプタです。

```
script.md → Deck → Cue → Synth → Timeline → schedule
                                      ├→ RehearseDriver → player.go()
                                      └→ VideoDriver    → player.go() + frames → mux
```

動画の撮影はトークを実時間で再生しません。各ビートは静止フレーム 1 枚と遷移に必要なフレームだけを作るので、描画時間はトークの長さではなく動きの量に比例します。スライドのスクリプトも同じ時計で動きます。動画モードのプレイヤーは各スクリプトを `t = 0` で止めておき、worker が `window.dekMotion` を通して同じ位置へシークします。

## 任意依存

Playwright、ffmpeg、音声エンジンは任意です。欠けているときは、それを必要とするコマンドだけが失敗し、hint が何を入れるべきかを伝えます。CLI 自体は常に起動します。

Bun の Node 互換は部分的なので、Playwright は実行時に `node_modules` から解決し、別のワーカープロセスで動かします。`DEK_PLAYWRIGHT` で代わりのワーカーを指定でき、テストはこれでブラウザなしに動いています。rumdl は `DEK_RUMDL`、`PATH`、dek 本体のインストール先の `node_modules/.bin` の順に探します。どちらもカレントディレクトリからは探しません。clone したリポジトリが中身を決められるからです。

## 自分が書いていないプロジェクト

dek はプロジェクトをビルドしますが、dek を動かす Bun の設定はプロジェクトには決めさせません。`dekc` の bin は Bun を `--no-env-file --config=/dev/null` で動かし、dek が起動する bun にも同じフラグを付けます。そのため、カレントディレクトリの `.env` や `bunfig.toml` で変数を設定したり、コードを preload したりはできません。パッケージには dek 自身の `tsconfig.json` が入っているので、プロジェクトの `paths` で dek の import を差し替えることもできません。`dekc ref` がトークンを送るのは `api.github.com` だけで、送るのは `GITHUB_TOKEN` か `GH_TOKEN` に設定されたものだけです。dek が `gh` にトークンを尋ねることはありません。ref のタイトルは 80 文字までの 1 行として `AGENTS.md` に入るので、そこに見出しや指示を足すことはできません。ref の slide script は `dekc shot` で撮るときに動きますが、Chromium の sandbox を（起動できる環境では）有効にし、ネットワークを切った状態で動かします。

dek をどう起動するかは、dek には確かめられません。`bun ./node_modules/.bin/dekc` は bin のフラグを飛ばすので、dek が動く前に Bun がプロジェクトの `bunfig.toml` を読みます（`.env` が設定した `DEK_` の変数は、この場合も dek が無視します）。プロジェクトの `package.json` の scripts や、`node_modules` の下にコミットされたものは、そのプロジェクト自身のコードです。自分が書いていないプロジェクトで dekc を実行する前に、実行する `dekc` が自分でインストールしたものか確かめてください。どの報告が対象になるかは [SECURITY.md](https://github.com/hajimism/dek/blob/main/SECURITY.md) にあります。

## エージェントの接点

エージェントとの接点は CLI です。結果を返すコマンドはすべて `--json` を受け、診断は SARIF、`dekc help --agent` が圧縮リファレンスです。[AI エージェントと作る](./ai)と [CLI リファレンス](/ja/reference/cli)を参照してください。
