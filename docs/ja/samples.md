# サンプル

dek で作った、dek 自身を題材にした 3 つのトークです。[`sample/`](https://github.com/hajimism/dek/tree/main/sample) のデッキを dek.pub の公式アカウント [@dek](https://dek.pub/@dek) で公開しており、各リンクからトークのページを開けます（台本はいずれも日本語です）。

| デッキ | 長さ | 内容 |
| --- | --- | --- |
| [why-dek](https://dek.pub/@dek/why-dek) | 12 分 | 配布資料としても読める解説。各スライドで主張を文として書き、それぞれに図を添えている。印刷向きの紙面を意識したスイス風エディトリアル。 |
| [lightning](https://dek.pub/@dek/lightning) | 3 分 | ターミナルで発表を 1 本作ってみせるライトニングトーク。コマンド出力はすべて実測の本物。琥珀色の CRT 風デザイン。 |
| [with-agents](https://dek.pub/@dek/with-agents) | 6 分 | スライド制作を AI コーディングエージェントに任せる話。数値で返す、小さなファイル、止めどきは lint が決める。プロダクトページ風の UI。 |

手元で発表を動かしてみたい場合は、[README](https://github.com/hajimism/dek/blob/main/README.ja.md#サンプル) の手順で `sample/` から `bun run build` を実行し、`dist/` の HTML ファイルをブラウザで開いてください。`→` または `Space` で進み、`←` で戻ります。ビートを進め切ると次のスライドへ移ります。`p` で台本付きの発表者ビュー、`s` でスライド一覧の切り替え、`f` で全画面表示になります。同じファイルを別ウィンドウで開くと 2 つのウィンドウが自動で同期します（プロジェクターへ観客ビューを出すときと同じ仕組みです）。その他のキー操作は[発表する](/ja/guide/present#キー操作)を参照してください。

スライドの実装を見たい場合は、[`sample/decks/`](https://github.com/hajimism/dek/tree/main/sample/decks) を直接読むか、デッキを ref として登録して `dekc show` で確認してください。

```bash
dekc ref hajimism/dek/why-dek
dekc show hajimism/dek/why-dek timing
```
