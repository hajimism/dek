---
description: '埋め込み API。ビルド済みデッキを iframe に埋め込んだ親ページから、postMessage でスライド移動・位置取得・要素選択・ピン描画を制御する仕様。'
---

# 埋め込み API

`dekc build` で生成した HTML ファイルは、外部ページの `<iframe>` 内に埋め込んで親ページから操作できます。できることは「任意のスライドへ移動させる」「現在位置を取得する」「閲覧者にスライド上の要素を選ばせる」「スライド上に番号付きピンを描画する」の 4 つです。dek.pub もこの API を使ってスライドと台本・レビューコメントを並べて表示しており、任意の Web ページから同じ連携ができます。設計の経緯は [ADR 45](https://github.com/hajimism/dek/blob/main/adr/0045-let-a-page-that-frames-a-built-deck-drive-it-through-postmessage.md) を参照してください。

この API が有効になるのは `<iframe>` 内に埋め込まれたデッキ（`window.parent !== window`）だけで、単独で開いた場合は無効です。通信には `window.postMessage` を使い、メッセージはすべて `type` が `dek:` で始まるプレーンオブジェクトです。

## デッキを埋め込む

`dek:ready` を取りこぼさないよう、`iframe.src` を設定する前に `message` リスナーを登録してください。

```html
<iframe id="deck" sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>
<script>
  const frame = document.getElementById("deck");
  addEventListener("message", (event) => {
    if (event.source !== frame.contentWindow) return;
    const message = event.data;
    if (message.type === "dek:ready") {
      frame.contentWindow.postMessage({ type: "dek:goto", slug: "plan" }, "*");
    }
  });
  frame.src = "https://example.com/talks/demo.html";
</script>
```

上の `sandbox` 属性は dek.pub で実際に使っている設定です。デッキのスクリプト実行とオリジン維持（URL ハッシュ動作に必要）、およびリンクの別ウィンドウ起動を許可します。デッキ HTML は親ページと別オリジンから配信しても問題なく、dek.pub ではデッキごとに専用のオリジンから配信しています。

埋め込まれたデッキはスライド表示に特化します。単独閲覧時に閲覧者が開いていた状態にかかわらず、スライド一覧は閉じた状態で始まり、操作ガイドも出しません（キー操作はそのまま使え、`s` で一覧を開くこともできますが、単独閲覧時の保存状態には影響しません）。閲覧者がデッキを操作している間はフォーカスが `<iframe>` 内にあるため親ページへキーが届きません。そこで、プレイヤー自身が使わない `c` キーだけは `dek:key` として親ページへ転送します（下表参照）。

## デッキから親ページへ送るメッセージ

デッキは `window.parent` へ対象オリジン `"*"` でメッセージを送信します。`--public` なしでビルドしたファイルであっても、台本・発表者メモ・発表者ビューの内容が送信されることはありません。ただし `dek:ready` にはデッキのフォルダ名・全スラッグ・ビート id が、`dek:picked` には選択要素のテキストが含まれ、埋め込んだどの親ページにも届きます。非公開デッキを配信する場合は `Content-Security-Policy: frame-ancestors` で許可する親ページを限定してください（dek.pub もそうしています）。

| メッセージ | 送信タイミング |
| --- | --- |
| `{ type: "dek:ready", protocol: 1, deck, size: { width, height }, slides: [{ slug, steps }], current: { slug, step, index } }` | プレイヤーが初期化され、`dek:goto` を受け付けられる状態になったときに 1 回（直後に返した `dek:goto` も即座に処理される）。`deck` はフォルダ名、`size` はスライドの論理サイズ（`16:9` なら `1280×720`、`4:3` なら `1024×768`）、`steps` は各停止位置の配列 |
| `{ type: "dek:moved", slug, step, index, by }` | 移動の開始時。`by` は `dek:goto` 起点なら `"embed"`、キー・クリック・スワイプ・スライド一覧・URL ハッシュ・別ウィンドウ同期なら `"reader"`。同じ位置にとどまる操作では送らない。`dek:current` への応答もこの形式（`by: "embed"`） |
| `{ type: "dek:picked", slug, step, target: { kind: "element", path, name, text, box } }` | 選択モード中に閲覧者が要素をクリックしたとき |
| `{ type: "dek:pick-cancel" }` | 選択モード中に `<iframe>` 内で `Escape` が押されたとき（選択モードも同時に終了） |
| `{ type: "dek:mark", id }` | 閲覧者がピンをクリックしたとき（`id` は該当ピンの ID） |
| `{ type: "dek:key", key: "c" }` | `<iframe>` にフォーカスがある状態で `c` が押されたとき（スライド上の入力欄外、`Alt`・`Ctrl`・`Cmd` なし、長押しリピートなし、かつプラグインが `c` を予約していない場合のみ）。デッキ側では何もせず、動作は親ページに委ねる（dek.pub はコメント欄を開く）。旧バージョンのビルドは送信しないため、親ページ側にも同等のボタンを用意しておくこと |

`slug` は `script.md` のスライド id、`index` は 0 始まりのスライド位置、`step` は `dekc shot --step` と同じ停止位置（スライド表示直後が `"0"`、以降各ビートの `{#id}` または 1 始まりの番号）です。

`dek:picked` の `target` 各フィールドは次の意味を持ちます。

- `path`：デッキ内のスライド HTML パス（`slides/intro.html` など）。
- `name`：タグ名とビルド時点のクラス（`div.chevron` など）。プレイヤーが付与する状態クラス（`is-current`・`is-shown`）やスライドスクリプトが動的に足したクラスは除かれるため、ソース HTML 上の要素と照合しやすい名前になります。
- `text`：選択要素の可視テキスト。連続空白をまとめ、40 文字を超えると `…` で省略します。未表示のビートや `<style>` 内など非表示のテキストは除かれ、要素に当たらずスライド本体が選ばれた場合は `""` になります。
- `box`：スライド左上を原点としたスライド論理ピクセル座標（丸め済み）。`<iframe>` の表示サイズに依存せず、注釈モードと同じ座標系です。静止画へ重ねる場合は `dek:ready` の `size` で割って比率へ変換してください。

## 親ページからデッキへ送るメッセージ

デッキがメッセージを受け付けるのは、`event.source` が自分を埋め込んでいる親ウィンドウであり、かつ下表のフィールドと型に厳密一致する場合だけです。余分なフィールドが 1 つでもあるメッセージは無視します。文字列は 1〜256 文字、数値は有限値、`box` の `width`・`height` は非負、`marks` 配列は疎配列不可です。

| メッセージ | 動作 |
| --- | --- |
| `{ type: "dek:goto", slug, step? }` | 指定した `slug` の `step`（省略時は `"0"`）へ移動。存在しない `slug` や `step` は無視 |
| `{ type: "dek:current" }` | 現在位置を `dek:moved` で応答 |
| `{ type: "dek:pick", on }` | 選択モードのオン・オフを切り替え |
| `{ type: "dek:marks", marks: [{ id, number, slug, step, box }] }` | 指定したピン一覧で既存のピンを置き換えて描画（`[]` で全消去）。最大 1000 件、`number` は 0 以上の整数 |

### 移動

`dek:goto` はキー操作と同様にスライドを移動し、URL ハッシュも更新します。スライド間移動では View Transition を再生しますが、`display: none` や画面外で描画されていない `<iframe>` の場合は短時間待って遷移をスキップし、即座に移動します（非表示状態のデッキを事前に動かしておけます）。

埋め込み中は、閲覧者の操作を含めすべての移動で履歴を追加せず現在エントリを置き換えるため、親ページでブラウザの「戻る」を押したときに意図せずスライドが戻るのではなくページ遷移として機能します。また、埋め込みデッキからは他ウィンドウへ移動を送信しないため、1 ページ内に同じデッキの `<iframe>` を 2 つ置いても互いに干渉しません（外部ウィンドウからの同期通知は従来どおり受信し、`by: "reader"` として通知します）。単独で開いたデッキではどちらも従来の挙動のままです。

### 選択モード

選択モードを有効にすると、表示中のスライドでポインター直下（または数 px 以内）にある要素が枠で強調されます（`pointer-events: none` の要素も対象）。クリックするとスライドを進めずに `dek:picked` を送信します。1 回選んでも選択モードは継続し、`on: false` の `dek:pick` を送るか、`<iframe>` 内の入力欄外で `Escape` を押すと終了します。選択モード中でもキーボードでスライドを移動できるため、別スライドの要素もそのまま選べます。

### ピン

ピンは dek のインスペクターと同じ青い小さな円形で、`number` を表示し、`box` の右上角を中心に配置されます。対象スライド（`slug`）が表示されている間はどの停止位置でも描画されます（`step` は親ページ側で管理するための付帯情報です）。ピンをクリックしてもスライドは進まず、`dek:mark` だけを送信します。
