---
description: 'プラグインは dekc lint でデッキを検査する実行ファイル dek-<name> である。プロジェクトでの使い方と、作者が従う申告・検査・lock の形。'
---

# プラグイン

プラグインは、dek の知らない検査を、エージェントがもともと走らせる `dekc lint` に足します。イベントのスライドの決まりや、学習用ツールのシールの検査がその例です。プラグインは、ユーザーがインストールする実行ファイル `dek-<name>` 一つです。別のプロセスで動き、dek とは JSON と SARIF で話します。この決定とその理由は [ADR 32](https://github.com/hajimism/dek/blob/main/adr/0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md) にあります。

## 公式プラグイン

dek は、自分のパッケージに一つのプラグイン dek-study を同梱しています。インストールは要りません。`dek.toml` で名前を挙げれば、dek は自分のファイルから走らせます。`PATH` 上の `dek-study` は使いません（[ADR 34](https://github.com/hajimism/dek/blob/main/adr/0034-ship-dek-study-inside-dek-as-its-first-official-plugin.md)）。

### dek-study

学習用のデッキで、思い出せるようになりたい言葉にシールを貼ります。開発サーバーとビルドしたファイルでは、シートがシールをスライドに重ねます。検査は、スライドが変わってもシールがその言葉の上に残るようにします。

```toml
[plugins.study]
```

シールは、デッキのフォルダの `study.yaml` に書きます。

```yaml
version: 1
stickers:
  - id: s_8k2f                   # デッキの中で一意
    slide: planning-fallacy      # スライドの slug
    quote: 外部視点               # シールが隠す言葉
    prefix: 楽観的に見積もる傾向に、  # 省略可。直前の言葉で、二か所を見分ける
```

スライドの言葉は、HTML のうち読む人に見える文字です。`script`、`style`、`template`、`noscript` の中とコメントは含みません。連続する空白は一つの空白として読みます。単語を空白で区切る言語では、quote は単語単位で探すので、`is` は "This" の中には見つかりません。日本語、中国語、韓国語、タイ語では、文字の並びとして探します。`prefix` のあるシールは、その直後に言葉が来る最初の場所を覆い、ないシールは残った最初の場所を覆います。`1868` のように YAML が数や true・false として読む値は、引用符で囲んでください。

| ID | 重大度 | 条件 |
| --- | --- | --- |
| `STUDY001` | error | シールの言葉がそのスライドにない、またはスライドがデッキにない。言葉がそのスライドから消えてほかの一枚にだけあれば、ヒントがそのスライドを示す。まだそのスライドにあれば、prefix が合わなくなったのか、どの場所もほかのシールが覆っているのかをメッセージが示す |
| `STUDY002` | warning | シールの言葉が、同じスライドのシールのない場所にも出ている |
| `STUDY003` | error | `study.yaml` を読めない。YAML でない、`version` が 1 でない、`id`・`slide`・`quote` のないシールがある、シールの言葉を YAML が数や true・false として読む、二つのシールが同じ id を持つ。ほかのシールは検査する |

指摘はどれも、`study.yaml` のそのシールの行を指します。`study.yaml` のないデッキには、検査するものがありません。

#### シート

`dekc sync` が dek-study を固定すると、開発サーバーと `dekc build` のファイルのすべてのスライドにシートが付きます。

- **`r`** でシートを被せ、外します。最初は外れていて、ブラウザがデッキごとに覚えます。右上に SHEET ON か SHEET OFF を短く表示します。
- **シール**は、付箋のような薄い黄色の紙で、角は直角です。
- **シールにポインタを置く**と、すぐにフェードアウトし、黄色い下線を残して言葉が見えます。ポインタを離すと戻ります。
- まだ来ていないビートの上のシールは、そのビートまで待ちます。ビートが見せるものを先に明かさないためです。
- 開発サーバーでは、`study.yaml` を書き換えるとページを読み直します。

シートは、プレゼンター画面、スクリーンショット、PDF、pptx、動画、見た目の lint には入りません。レールのサムネイルにはまだ付かないので、そこでは言葉が見えます。

## プラグインを使う

次の手順は、ほかの人が書いたプラグインのためのものです。公式プラグインは最初の手順が要りません。

1. `dek-<name>` を、`PATH` の通った、プロジェクトの外の場所にインストールします。
2. `dek.toml` で名前を挙げます。

   ```toml
   [plugins.glossary]
   ```

3. `dekc sync` を実行します。プラグインに申告（マニフェスト）を出させ、lock である `plugins/glossary/plugin.json` に書きます。lock はコミットします。
4. `dekc lint` を実行します。プラグインの指摘が、プラグインのルール id（`GLOSSARY001` など）で、dek の指摘と並んで出ます。

AGENTS.md には、プラグインごとに版、ルール id、データファイルを載せます。エージェントは、lint が何を検査するかをそこで知ります。

### lock

`plugins/<name>/plugin.json` には、プロジェクトが受け入れた申告を書きます。中身は、プラグインの版、ルールとその重大度、データファイルです。同じフォルダには、すべてのデッキの検査に使うリストのように、プラグインがプロジェクト全体のために持つデータも置きます。lock と一緒にコミットします。`dekc lint` は、インストールされたプラグインの申告が lock とまったく同じときだけ、そのプラグインを走らせます。そのため、別の版を入れたチームの仲間や CI では、違う検査が走るのではなく、検査が走らず、走らなかったと報告されます。

更新などで、インストールされたプラグインの申告が変わると、`dekc sync` は何が変わったかを挙げます。`version 0.1.0 → 0.2.0` や `GLOSSARY003 added (error)` のような形です。lock は書き換えません。変わったところを読んでから、受け入れます。

```bash
dekc sync --accept glossary
```

lock が固定するのは、プラグインのバイナリではなく、プラグインの約束です。そのため、macOS で書いた lock が Linux の CI でも通ります。

### プロジェクトにできること、できないこと

プロジェクトにできるのは、ユーザーがインストールしたプラグインから、使うものを選ぶことだけです。`[plugins.<name>]` にはキーを書けません。書けば `DEK008` になります。プロジェクトは、実行するパス、引数、プログラムを指定できません。dek は `dek-<name>` を `PATH` からだけ探し、相対パスのエントリと、プロジェクトの中を指すエントリは飛ばします。後者には、`bunx` が足すプロジェクトの `node_modules/.bin` や、direnv や mise が足すフォルダが含まれます。clone したリポジトリにコミットされたプラグインが走ることはありません。同じ理由で、`bun add -d dek-<name>` で入れたプラグインも dek は走らせません。そのときは、そう伝え、見つけた場所を示します。

プラグインは、インストールしたほかのものと同じく、あなたの権限で動きます。別のプロセスにすることで、プラグインがクラッシュしても dek は巻き込まれません。隔てるのはそれだけです。

### プラグインが走らないとき

`dekc lint` は、走らなかったプラグインを pass と数えません。`--json` の `skipped` に `{ "check": "plugin", "plugin": "<name>", "reason", "hint" }` として挙げます。次のときです。

- インストールされていない
- プロジェクトにまだ lock がない（`dekc sync` が書く）
- インストールされたものが lock と違う（`dekc sync` が違いを示す）
- もっと新しい dek を要する

プラグインが失敗したときは、エラーの [`DEK046`](/ja/reference/lint#ルール) になります。申告や検査が 0 以外で終わった、時間内に終わらなかった、SARIF を出さなかった、lock にないルールを報告した、などの場合です。デッキの問題ではないので、ヒントは「ユーザーに伝える」です。

プラグインが走るのは、rumdl と同じく `dekc lint` だけです。`dekc check`、`dekc build`、開発サーバーでは走りません。

## プラグインを書く

プラグインは、`dek-<name>` という名前の実行ファイルです。`<name>` は小文字の英字で始まり、小文字の英字、数字、ハイフンが続く、40 文字以内の名前です。`dek` と `md` は使えません。Windows では `.exe` でなければなりません。答えるサブコマンドは二つです。それ以外に何をするかは、プラグインの自由です。

TypeScript で書くプラグインは、下の形を、コードなしの型として dek から読み込めます。

```ts
import type { CheckInput, CheckOutput, PluginManifest } from "@hajimism/dek/plugin";
```

`PluginManifest<"GLOSSARY">` はルール id の接頭辞を検査し、`CheckOutput<"GLOSSARY001" | "GLOSSARY002">` は申告していない id の指摘を型の段階で拒みます。

### `dek-<name> manifest`

申告を JSON で stdout に出し、0 で終わります。

```json
{
  "schema": 1,
  "name": "glossary",
  "version": "0.1.0",
  "check": {
    "protocol": 1,
    "rules": {
      "GLOSSARY001": { "severity": "error", "summary": "a term is used before it is defined" },
      "GLOSSARY002": { "severity": "warning", "summary": "a term is spelled two ways" }
    }
  },
  "data": [{ "path": "glossary.yaml" }]
}
```

| 欄 | 意味 |
| --- | --- |
| `schema` | 申告の版。`1`。知らない版なら、dek はそのプラグインを飛ばし、dek の更新を促す |
| `name` | `dek-<name>` の `<name>` |
| `version` | 英数字と `.`、`+`、`-` からなる一語。64 文字以内 |
| `check` | 省略できる。ないとき、dek は検査を走らせない |
| `page` | 省略できる。`{ "api": 1, "keys": ["r"] }`。プレーヤーとビルドに入る、ページ API 1 を呼ぶページと、それが使うキー。キーは dek のもの（`a f l m p s`）以外の英小文字一字。今のところ、デッキに届くのは公式プラグインのページだけ（[ADR 33](https://github.com/hajimism/dek/blob/main/adr/0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md)） |
| `check.protocol` | 下のやりとりの版。`1` |
| `check.rules` | 検査が報告しうるルール id のすべて。id は、名前を大文字にし、`-` を `_` にして、数字三桁を続けたもの。`glossary` なら `GLOSSARY001`、`acme-talks` なら `ACME_TALKS001` |
| `…severity` | `error` か `warning`。dek は結果の SARIF の `level` ではなく、これを使う。lint を失敗させるのは error だけ |
| `…summary` | 一行、120 文字以内。dek は SARIF のルール一覧にだけ出す |
| `data` | 省略できる。プラグインが読むファイル。AGENTS.md に名前が載る。`{ "path": "glossary.yaml" }` はデッキの中のファイルで、デッキのフォルダからの相対パス。隠しファイルでも、デッキの外でも、dek 自身のもの（`script.md`、`theme.css`、`slides/`、`assets/`、`voice/`、`dist/`）でもないこと。`{ "path": "terms.yaml", "in": "project" }` はプロジェクトの `plugins/<name>/` の中のファイルで、すべてのデッキが共有するデータに使う。隠しファイルでも、そのフォルダの外でも、`plugin.json` でもないこと。ページに渡るのはデッキのファイルだけ（[ADR 35](https://github.com/hajimism/dek/blob/main/adr/0035-let-a-plugin-keep-data-for-the-whole-project-in-plugins-name.md)） |

知らない欄は無視します。申告には、案内の文章を書く欄はありません。エージェントがプラグインについて読む文は、dek がこれらの事実から書きます。毎回同じ申告を出してください。制限時間は 10 秒です。

### `dek-<name> check --protocol 1`

dek は、デッキごとに一回、デッキのフォルダで、デッキを JSON にして stdin に渡して走らせます。

```json
{
  "protocol": 1,
  "dek": "0.5.1",
  "deck": {
    "name": "intro",
    "lang": "ja",
    "slides": [
      { "slug": "planning-fallacy", "title": "計画錯誤", "html": "slides/planning-fallacy.html", "css": null, "ts": null }
    ]
  },
  "pluginDir": "/home/me/talks/plugins/glossary"
}
```

スライドのパスはデッキのフォルダからの相対パスで、ファイルがなければ `null` です。`pluginDir` はプロジェクトの `plugins/<name>/` の絶対パスで、`"in": "project"` の `data` はここにあります。フォルダがなくても渡します。このフィールドより古い dek は渡さないので、そのときはプロジェクトのデータがないものとして扱います。ファイルはプラグインが自分で読みます。

SARIF 2.1.0 を stdout に出し、指摘があってもなくても 0 で終わります。0 以外の終了は、検査そのものの失敗を意味します。dek は各結果から次を読みます。

| SARIF | dek の指摘 |
| --- | --- |
| `ruleId` | `id`。`check.rules` にあること |
| `message.text` | `message`。必須 |
| `locations[0].physicalLocation.artifactLocation.uri` | `path`。デッキのフォルダからの相対パスか、デッキの中か `pluginDir` の中を指す `file:` URL。それ以外の場所は捨てる。`slides/<slug>.html`、`.css`、`.ts` なら `slug` も付く |
| `…region.startLine`、`…region.startColumn` | `line`、`column` |
| `properties.hint` | `hint`。次にすること |

dek は、メッセージとヒントを、それぞれ 300 文字以内の一行にします。重大度は申告から決まります。プロジェクトのデータファイルの誤りのように、`pluginDir` の中への指摘をどのデッキの検査も同じ形で返すときは、一度だけ報告します。

検査は、同じ入力には同じ出力を返し、ファイルを書かず、ネットワークを使わないと約束します。制限時間はデッキごとに 30 秒です。過ぎれば SIGTERM で止め、のちに SIGKILL を送ります。一度止まらなかった検査は、その後のデッキでは走らせません。

### ページ API 1

ページは、開発サーバーのプレーヤーと `dekc build` のファイルで、dek のプレーヤーの後に動き、グローバルには一つだけ触れます。

```ts
import type { DekPage } from "@hajimism/dek/plugin";
declare const dek: DekPage;

dek.plugin("glossary", { api: 1 }, (api) => {
  api.deck;                 // { name }
  api.slides;               // [{ slug, title }]
  api.current();            // { slug, index, beat }。beat 0 はスライドに来たところ
  api.on("change", (position) => {});            // 初めに一度、その後デッキが落ち着くたびに
  api.on("mount", ({ slug, root, layer, view }) => {});
  api.shown(element);       // まだ来ていないビートに隠されていないか
  api.data("glossary.yaml");   // { text, version } | null。申告したファイルだけ
  api.key("r", () => {});   // 申告していないキーなら false
});
```

- `mount` は、ステージのすべてのスライドで呼びます（`view` は `"stage"`）。ライブリロードで差し替わったスライドでも、もう一度呼びます。`root` はそのスライドで、読むだけにし、変えてはいけません。lint はそのままの形を検査したからです。`layer` はスライドの上に重なる ShadowRoot で、座標はスライドのピクセル、そのプラグインだけのものです。表示されるのは今のスライドの層だけで、層の土台はポインタを受けません。ポインタが要る要素には `pointer-events: auto` を付けます。
- 今のスライドでない層は大きさが 0 なので、測るのは `change` のときにします。
- ページは、プレゼンター画面、動画、dek がスクリーンショット・PDF・pptx・見た目の lint のために描くページには入りません。
- ページが投げた例外は受け止め、コンソールに名前を出します。プレーヤーは止まりません。
