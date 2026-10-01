# サンプル

dekc で作った、dekc についての 3 つのトークです。どのリンクも、そのデッキを `dekc build` した HTML ファイルそのものを開きます。スライドもテーマも画像もプレイヤーも、ファイルひとつに入っています。サイトを公開するたびに [`sample/`](https://github.com/hajimism/dekc/tree/main/sample) からビルドしているので、いつもソースと同じです。

| デッキ | 長さ | 内容 |
| --- | --- | --- |
| [why-dekc](/dekc/samples/why-dekc.html){target="_self"} | 12 分 | 配布資料としても読める解説。どのスライドも言いたいことを文で書き、それぞれに図があります。印刷向きの紙に組んだスイス風のエディトリアル。 |
| [lightning](/dekc/samples/lightning.html){target="_self"} | 3 分 | ターミナルで発表をひとつ作ってみせるライトニングトーク。コマンドの出力は本物です。琥珀色の CRT。 |
| [with-agents](/dekc/samples/with-agents.html){target="_self"} | 6 分 | スライドを AI コーディングエージェントに任せる話。数字で返す、小さなファイル、止めどきは lint が決める。プロダクトページ風の UI。 |

`→` か `Space` で進み、`←` で戻ります。ビートを進めきると次のスライドに移ります。`p` で台本付きの発表者ビュー、`s` でスライド一覧を隠し、`f` で全画面になります。同じデッキを別ウィンドウで開くと、2 つがお互いに追従します。観客ビューをプロジェクタに出すときと同じです。キーの一覧は[発表する](/ja/guide/present#キー操作)にあります。

スライドの作りを見るなら、[`sample/decks/`](https://github.com/hajimism/dekc/tree/main/sample/decks) のファイルを読むか、デッキを ref として固定して dekc に聞いてください。

```bash
dekc ref hajimism/dekc/why-dekc
dekc show hajimism/dekc/why-dekc timing
```
