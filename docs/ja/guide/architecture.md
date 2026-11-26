---
description: 'CLI と開発サーバーが共有する core、任意の外部依存、信頼できないプロジェクトに対する防御。'
---

# アーキテクチャ

最も重要な設計判断は、**core** を独立したモジュールに切り出したことです。CLI と開発サーバーは同じパーサー、同じ lint ルール、同じプロジェクト解決ロジックを共有します。パーサーが 2 つあれば、いずれ必ず挙動が食い違います。

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

CLI は原則としてファイルを直接読み書きします。ブラウザの表示状態を取得・変更する必要がある `goto` と `current` の 2 コマンドだけが、起動中の開発サーバーへ HTTP で問い合わせます（サーバーが動いていなければ hint 付きで失敗します）。

ネットワーク通信が発生するコマンドも限られています。

- **`dekc ref`**（およびスナップショット未取得時の `ls`・`show`・`theme`・`shot`）：固定されたコミットを GitHub から取得します。
- **`dekc pub`**：[dek.pub](./publish)（または `--server` / `DEK_PUB_SERVER` で指定したサーバー）と通信します。許可されるのは HTTPS とローカルホストへの平文 HTTP だけで、リダイレクトには追従しないため API キーが別オリジンへ漏れることはありません。`dekc pub login` で得た API キーはサーバーごとに `Bun.secrets` 経由で OS のキーチェーン（サービス名 `dek.pub`、キー名はサーバーのオリジン）へ保存され、キーチェーンがない環境では所有者のみ読み取り可能な `$XDG_CONFIG_HOME/dek/credentials.json`（既定 `~/.config/dek/`）に保存されます。他ユーザー所有または他者から読み書き可能な資格情報ファイルは読み込みません。CI 用の `DEK_TOKEN` はディスクに保存せず、`https://dek.pub` か `DEK_TOKEN_SERVER` へだけ送信します。
- `lint`・`build`・`sync` はネットワークへ一切アクセスしません。

ビルドした単一 HTML もサーバーへ接続しません。プレイヤーのランタイムは 2 通りにコンパイルされており、`build`・`video`・`shot` に埋め込む側には同期用 WebSocket、ライブリロード、マーク、リハーサル、注釈モードを含めません。これらは開発サーバーのページ専用です。

## 声と動画

音声と動画は、同じ core の上に独立したドライバーとして載っています。core が扱うのは Cue・Timeline・スケジュールだけで、音声エンジン・ffmpeg・ブラウザはすべてアダプター層に分離しています。

```
script.md → Deck → Cue → Synth → Timeline → schedule
                                      ├→ RehearseDriver → player.go()
                                      └→ VideoDriver    → player.go() + frames → mux
```

動画生成はトークを実時間で録画しません。各ビートについて静止フレーム 1 枚と遷移・アニメーションに必要なフレームだけを描画するため、処理時間はトークの総尺ではなく動きの量に比例します。スライドスクリプトも同じ時計で制御しており、動画モードのプレイヤーは各スクリプトを `t = 0` で止めた状態にし、ワーカーが `window.dekMotion` 経由で同じ時刻へシークします。

## 任意依存

Playwright・ffmpeg・音声合成エンジンはいずれも任意です。入っていない場合はそれを必要とするコマンドだけが失敗し、導入手順の hint を表示します。CLI 本体自体は常に起動できます。

Bun の Node.js 互換機能には未対応の部分があるため、Playwright は実行時に `node_modules` から解決して別ワーカープロセスで動かしています。`DEK_PLAYWRIGHT` で代替ワーカーを指定できる設計になっており、自動テストではこれを使ってブラウザなしで検証しています。rumdl は `DEK_RUMDL`、`PATH`、dek 本体がある `node_modules/.bin` の順で探します。clone したリポジトリが任意バイナリを仕込めるため、どちらもカレントディレクトリからは探しません。

## 自分が書いていないプロジェクト

dek はプロジェクトをビルドしますが、dek 自身を動かす Bun の設定はプロジェクト側に委ねません。`dekc` のエントリポイントでは Bun を `--no-env-file --config=/dev/null` 付きで起動し、dek が内部から起動する bun プロセスにも同じフラグを渡します。これにより、カレントディレクトリの `.env` や `bunfig.toml` による環境変数の注入やコードの preload を防ぎます。パッケージ内には dek 自身の `tsconfig.json` を同梱しているため、プロジェクト側の `paths` で dek の import を乗っ取ることもできません。

外部入力や ref に対しても以下の境界を設けています。

- `dekc ref` が認証トークンを送るのは `api.github.com` だけで、参照するのは `GITHUB_TOKEN` または `GH_TOKEN` のみです（`gh` CLI からトークンを自動取得することはありません）。
- ref のタイトルは不可視文字をコードポイント表記へ置換した 80 文字以内の 1 行として `AGENTS.md` に記録するため、見出しや指示を紛れ込ませられません。hint にも ref の文字列を引用しません。
- テキスト出力からはデッキや ref 由来の ANSI エスケープコードを除去します。`dekc show` ではファイル内容が区切り行を偽装できないようエスケープし、ref を読むコマンドはファイル内の不可視文字を警告します。
- `dekc shot` で ref のスライドスクリプトを動かす際は、Chromium の sandbox を有効にし、ネットワークを遮断した状態で実行します。

### Chromium の sandbox が起動しない環境

次のような環境では Chromium の sandbox が起動できません。

- コンテナを `root` で実行している場合
- Ubuntu 23.10 以降（GitHub Actions の `ubuntu-24.04` ランナーを含む）で AppArmor が Chromium による user namespace 作成を制限している場合
- Docker の既定 seccomp プロファイルの下で動かしている場合

こうした環境でも、プロジェクト自身のデッキ（作者自身のスクリプト）については sandbox なしで 1 度だけ再起動して描画し、毎回その旨を通知します。標準エラーに Chromium のエラーメッセージを添えて `warning: Chromium drew without its sandbox, which did not start here` と出力し、`--json` には `unsandboxed` を含めます。一方、他人のコードを含む ref に対しては、`dekc shot <ref>` は描画せず失敗します。

sandbox を有効にするには、`root` 以外のユーザーで実行するほか、Ubuntu では `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0` または Chromium 用の AppArmor プロファイルを、コンテナでは user namespace を許可する seccomp プロファイルを設定してください。sandbox なしの描画を明示的に許容する場合は環境変数 `DEK_ALLOW_UNSANDBOXED=1` を設定します。これにより ref も描画されるようになり（警告は毎回出力）、プロジェクト自身のデッキでは標準エラーの警告を抑止します（`--json` の `unsandboxed` は引き続き出力されます）。なお dek はどの環境でもまず sandbox 有効で起動を試み、両方で起動できない場合は両方の失敗理由を報告します。

### 起動方法に関する注意

dek 自身の起動方法までは dek 側で強制できません。たとえば `bun ./node_modules/.bin/dekc` のように直接実行すると bin のフラグが効かず、dek が動き出す前に Bun がプロジェクトの `bunfig.toml` を読み込みます（`.env` に書かれた `DEK_` 変数はこの場合も dek 側で無視します）。また、プロジェクトの `package.json` の scripts や `node_modules` 下にコミットされたファイルはそのプロジェクト自身のコードです。信頼していないプロジェクトで実行する前に、呼ぼうとしている `dekc` が自分でインストールしたものか確認してください。脆弱性報告の対象範囲は [SECURITY.md](https://github.com/hajimism/dek/blob/main/SECURITY.md) に記載しています。

## エージェントの接点

エージェントとのインターフェースは CLI です。結果を返すコマンドはすべて `--json` に対応し、診断は SARIF、`dekc help --agent` が圧縮リファレンスを提供します。詳しくは[AI エージェントと作る](./ai)と [CLI リファレンス](/ja/reference/cli)を参照してください。
