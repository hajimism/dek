# サンプル

dek で作った、dek についての 3 つのトークです。どのリンクも、そのデッキを `dek build` した HTML ファイルそのものを開きます。スライドもテーマも画像もプレイヤーも、ファイルひとつに入っています。サイトを公開するたびに [`sample/`](https://github.com/hajimism/dek/tree/main/sample) からビルドしているので、いつもソースと同じです。

| デッキ | 長さ | 内容 |
| --- | --- | --- |
| [why-dek](/dek/samples/why-dek.html){target="_self"} | 12 分 | 配布資料としても読める解説。どのスライドも言いたいことを文で書き、それぞれの図を持っています。印刷向きの紙に組んだスイス風のエディトリアル。 |
| [lightning](/dek/samples/lightning.html){target="_self"} | 3 分 | ターミナルで発表をひとつ作ってみせるライトニングトーク。コマンドの出力は本物です。琥珀色の CRT。 |
| [with-agents](/dek/samples/with-agents.html){target="_self"} | 6 分 | スライドを AI コーディングエージェントに任せる話。数字で返す、小さなファイル、lint が通れば完成。プロダクトページ風の UI。 |

`→` か `Space` で進み、`←` で戻ります。ビートを進めきると次のスライドに移ります。`p` で台本付きのプレゼンタービュー、`s` でスライド一覧を隠し、`f` で全画面になります。同じデッキを別ウィンドウで開くと、2 つがお互いに追従します。観客ビューをプロジェクタに出すときと同じです。キーの一覧は[発表する](/ja/guide/present#キー操作)にあります。

スライドの作りを見るなら、[`sample/decks/`](https://github.com/hajimism/dek/tree/main/sample/decks) のファイルを読むか、デッキを ref として固定して dek に聞いてください。

```bash
dek ref hajimism/dek/why-dek
dek show hajimism/dek/why-dek timing
```
