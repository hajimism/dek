---
description: 'プラグインは dekc lint でデッキを検査する実行ファイル dek-<name> である。プロジェクトでの使い方と、作者が従う申告・検査・lock の形。'
---

# プラグイン

プラグインは、dek の知らない検査を、エージェントがもともと走らせる `dekc lint` に足します。イベントのスライドの決まりや、学習用ツールのシールの検査がその例です。プラグインは、ユーザーがインストールする実行ファイル `dek-<name>` 一つです。別のプロセスで動き、dek とは JSON と SARIF で話します。この決定とその理由は [ADR 32](https://github.com/hajimism/dek/blob/main/adr/0032-let-a-plugin-the-user-installed-check-a-deck-and-pin-in-the-project-what-it-promised.md) にあります。

## プラグインを使う

1. `dek-<name>` を、`PATH` の通った、プロジェクトの外の場所にインストールします。
2. `dek.toml` で名前を挙げます。

   ```toml
   [plugins.study]
   ```

3. `dekc sync` を実行します。プラグインに申告（マニフェスト）を出させ、lock である `plugins/study/plugin.json` に書きます。lock はコミットします。
4. `dekc lint` を実行します。プラグインの指摘が、プラグインのルール id（`STUDY001` など）で、dek の指摘と並んで出ます。

AGENTS.md には、プラグインごとに版、ルール id、データファイルを載せます。エージェントは、lint が何を検査するかをそこで知ります。

### lock

`plugins/<name>/plugin.json` には、プロジェクトが受け入れた申告を書きます。中身は、プラグインの版、ルールとその重大度、データファイルです。`dekc lint` は、インストールされたプラグインの申告が lock とまったく同じときだけ、そのプラグインを走らせます。そのため、別の版を入れたチームの仲間や CI では、違う検査が走るのではなく、検査が走らず、走らなかったと報告されます。

更新などで、インストールされたプラグインの申告が変わると、`dekc sync` は何が変わったかを挙げます。`version 0.1.0 → 0.2.0` や `STUDY003 added (error)` のような形です。lock は書き換えません。変わったところを読んでから、受け入れます。

```bash
dekc sync --accept study
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

`PluginManifest<"STUDY">` はルール id の接頭辞を検査し、`CheckOutput<"STUDY001" | "STUDY002">` は申告していない id の指摘を型の段階で拒みます。

### `dek-<name> manifest`

申告を JSON で stdout に出し、0 で終わります。

```json
{
  "schema": 1,
  "name": "study",
  "version": "0.1.0",
  "check": {
    "protocol": 1,
    "rules": {
      "STUDY001": { "severity": "error", "summary": "a sticker's text is not on its slide" },
      "STUDY002": { "severity": "warning", "summary": "a hidden word shows elsewhere on the slide" }
    }
  },
  "data": [{ "path": "study.yaml" }]
}
```

| 欄 | 意味 |
| --- | --- |
| `schema` | 申告の版。`1`。知らない版なら、dek はそのプラグインを飛ばし、dek の更新を促す |
| `name` | `dek-<name>` の `<name>` |
| `version` | 英数字と `.`、`+`、`-` からなる一語。64 文字以内 |
| `check` | 省略できる。ないとき、dek は検査を走らせない |
| `check.protocol` | 下のやりとりの版。`1` |
| `check.rules` | 検査が報告しうるルール id のすべて。id は、名前を大文字にし、`-` を `_` にして、数字三桁を続けたもの。`study` なら `STUDY001`、`acme-talks` なら `ACME_TALKS001` |
| `…severity` | `error` か `warning`。dek は結果の SARIF の `level` ではなく、これを使う。lint を失敗させるのは error だけ |
| `…summary` | 一行、120 文字以内。dek は SARIF のルール一覧にだけ出す |
| `data` | 省略できる。プラグインが読む、デッキの中のファイル。デッキのフォルダからの相対パス。隠しファイルでも、デッキの外でも、dek 自身のもの（`script.md`、`theme.css`、`slides/`、`assets/`、`voice/`、`dist/`）でもないこと。AGENTS.md に名前が載る |

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
  }
}
```

パスはデッキのフォルダからの相対パスで、ファイルがなければ `null` です。ファイルはプラグインが自分で読みます。

SARIF 2.1.0 を stdout に出し、指摘があってもなくても 0 で終わります。0 以外の終了は、検査そのものの失敗を意味します。dek は各結果から次を読みます。

| SARIF | dek の指摘 |
| --- | --- |
| `ruleId` | `id`。`check.rules` にあること |
| `message.text` | `message`。必須 |
| `locations[0].physicalLocation.artifactLocation.uri` | `path`。デッキのフォルダからの相対パスか、デッキの中を指す `file:` URL。それ以外の場所は捨てる。`slides/<slug>.html`、`.css`、`.ts` なら `slug` も付く |
| `…region.startLine`、`…region.startColumn` | `line`、`column` |
| `properties.hint` | `hint`。次にすること |

dek は、メッセージとヒントを、それぞれ 300 文字以内の一行にします。重大度は申告から決まります。

検査は、同じ入力には同じ出力を返し、ファイルを書かず、ネットワークを使わないと約束します。制限時間はデッキごとに 30 秒です。過ぎれば SIGTERM で止め、のちに SIGKILL を送ります。一度止まらなかった検査は、その後のデッキでは走らせません。
