# サンプル

dek で作った、dek についての 3 つのトークです。[`sample/`](https://github.com/hajimism/dek/tree/main/sample) から dek.pub の公式アカウント [@dek](https://dek.pub/@dek) で公開していて、どのリンクも dek.pub 上のトークのページを開きます。台本は日本語です。

| デッキ | 長さ | 内容 |
| --- | --- | --- |
| [why-dek](https://dek.pub/@dek/why-dek) | 12 分 | 配布資料としても読める解説。どのスライドも言いたいことを文で書き、それぞれに図があります。印刷向きの紙に組んだスイス風のエディトリアル。 |
| [lightning](https://dek.pub/@dek/lightning) | 3 分 | ターミナルで発表をひとつ作ってみせるライトニングトーク。コマンドの出力は本物です。琥珀色の CRT。 |
| [with-agents](https://dek.pub/@dek/with-agents) | 6 分 | スライドを AI コーディングエージェントに任せる話。数字で返す、小さなファイル、止めどきは lint が決める。プロダクトページ風の UI。 |

自分で発表してみるなら、[README](https://github.com/hajimism/dek/blob/main/README.ja.md#サンプル) の手順で `sample/` から `bun run build` し、`dist/` の HTML ファイルを開いてください。`→` か `Space` で進み、`←` で戻ります。ビートを進めきると次のスライドに移ります。`p` で台本付きの発表者ビュー、`s` でスライド一覧を隠し、`f` で全画面になります。同じデッキを別ウィンドウで開くと、2 つがお互いに追従します。観客ビューをプロジェクタに出すときと同じです。キーの一覧は[発表する](/ja/guide/present#キー操作)にあります。

スライドの作りを見るなら、[`sample/decks/`](https://github.com/hajimism/dek/tree/main/sample/decks) のファイルを読むか、デッキを ref として固定して dek に聞いてください。

```bash
dekc ref hajimism/dek/why-dek
dekc show hajimism/dek/why-dek timing
```
