# アーキテクチャ

core を独立モジュールとして切り出すのが要点。CLI と開発サーバが同じパーサ、同じルールセット、同じプロジェクト解決を共有する。パーサが 2 箇所にあると必ず挙動がズレる。

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
                  └──── HTTP ─────┘   goto / current / check
```

CLI は開発サーバが立っていればそれに HTTP で問い合わせ、立っていなければ自分で core を呼ぶ。`goto` と `current` のようにブラウザの状態を扱うコマンドだけが、開発サーバを必須とする。

## 声と動画

声と動画は同じ core の上に、別ドライバとして載る。core は Cue / Timeline / schedule だけを知り、エンジンと ffmpeg と CDP はアダプタ。

```
script.md → Deck → Cue → Synth → Timeline → schedule
                                      ├→ RehearseDriver → Player.go()
                                      └→ VideoDriver    → Player.go() + frames → Mux
```

録画は仮想時間を試み、View Transitions が従わなければアニメーション区間だけ実時間で撮る。1x 壁時計録画は採用していない。トーク尺ぶん待たない。

## 任意依存

Playwright / ffmpeg / VOICEVOX は任意。未検出ならそのコマンドだけが次の一手付きで失敗する。CLI 全体はいかなる場合も起動できる。

Playwright は Bun の部分的な Node 互換性の影響を受ける。`--visual` / `shot` / `pdf` / `video` は Playwright を別プロセスで起動し、依存はオプショナルかつ動的 import とする。

エージェントとの接点は CLI。[AI と作る](./ai) を読む。コマンドの一覧は [CLI](/reference/cli) を見る。
