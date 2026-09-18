# AI と作る

目標: 人間と同じ CLI で、書いた HTML を見て聴いて直す。

専用の MCP もツール定義もない。コーディングエージェントはシェルとファイル編集を既に持っている。スライドは 1 枚 40 行の HTML なので、エージェント自身の編集ツールで直接書くのがいちばん正確で、いちばん安い。並べ替えと改名のように壊れやすい操作だけ `dek mv` として用意する。

## エージェントが読むもの

`sync` が `AGENTS.md` を短く保つ。三原則、規約、テーマのクラス語彙とトークン、`dek help --agent` へのポインタ。数十行で収め、詳細は必要なときに CLI から引かせる。

```bash
dek help --agent
```

これで Claude Code でも Codex でも OpenCode でも、追加設定なしに dek を扱える。

## CLI が守ること

1. 結果を出すコマンドに `--json`。`dek` と `dek rehearse` は起動したままなので対象外。診断は SARIF。テキストをパースさせる出力を作らない。
2. エラーは次の一手を言う。「`slides/intro.html` がありません。`dek sync` で生成できます」のように、そのまま実行できる文で失敗する。
3. `dek help --agent`。全コマンドの使い方を数百トークンに圧縮する。CLI 自身が自分のリファレンス。
4. `AGENTS.md` は短く保つ。

## 一往復で直す

```bash
dek check architecture --shot
dek check architecture --voice
```

`check` はその 1 枚だけを lint し（Playwright があれば描画系のルールも含む）、スクリーンショットを書き出し、SARIF と画像のパスを返す。`--voice` はカナと尺を `--json` で返す。HTML を書き、`check` を叩き、返ってきた画像と読みを自分で見て直す。書いた → 見た → 聴いた → 直した、が一往復で閉じる。

幾何で確定判定できるものは lint ルールにする。はみ出しもコントラストも、Playwright で測れば真偽が決まる。スクリーンショットを見せて「はみ出ていますか」と尋ねるより精度が高い。

## 指差しは双方向

```bash
dek goto architecture
dek current
```

エージェントが編集した直後に人間の画面を該当スライドへ飛ばす。人間が「この枚、右の図を小さくして」と言えば、エージェントは `dek current` で slug を知り、聞き返さずに直せる。

## 例

```
architecture.html の右カラムを小さくして。終わったら dek check architecture --shot を叩いて、はみ出しが無いことを確認して。
```

```
dek current のスライドを、台本の次のビートまで data-step で出して。
```

```
script.md に ## recap {#recap} を足した。dek sync せず、開発サーバに任せて。足りない HTML だけ骨格を生やして。
```

サイトの目次をエージェントに渡すときは [`/llms.txt`](/llms.txt) を使う。
