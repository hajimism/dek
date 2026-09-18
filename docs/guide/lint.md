# Lint

目標: 保存のたびに lint が通る状態を保ち、完成の定義を機械に預ける。

lint が通ることが完成の定義。開発サーバは保存のたびに走らせるので、普通に編集していれば常に通っている。明示的に `dek lint` を叩く必要はない。CI や 1 枚の確認のために個別に呼ぶ。

```bash
dek lint
dek lint --fix
dek lint --visual
dek lint --format sarif
dek check architecture --shot
```

`--fix` は DEK001 の骨格 HTML を足す。既存ファイルは触らない。

## 層

一般的な Markdown のルールは rumdl に完全に委譲する。自作するのは rumdl が原理的に見られないドメイン固有のルールだけ。

| 層 | 担当 |
| --- | --- |
| Markdown の作法 | rumdl |
| スキーマ | Zod |
| 整合性 | `script.md` ↔ `slides/*.html`、ビート ↔ `data-step` |
| テーマ準拠 | 未定義クラス、インライン style、トークン契約 |
| 自己完結 | 外部 URL、欠落画像、デッキ外参照 |
| 描画 | Playwright（はみ出し、コントラスト） |
| 読み | `voice/` があるデッキだけ |
| 尺 | Timeline があるデッキだけ |

## `--visual`

はみ出し（DEK030）とコントラスト（DEK031）は Playwright で測る。幾何で真偽が決まる。スクリーンショットを見せて「はみ出ていますか」と尋ねない。

Playwright が無ければ、そのコマンドだけが次の一手付きで失敗する。CLI 全体は起動できる。

- `lint --visual` — 検証。SARIF を返す。AI が自分の出力を確認する一次手段。
- `dek shot` — 判定ではなく観察。デザインの良し悪しと最終確認は人間に残す。

## 完成の定義は voice で変わらない

DEK040（辞書にない英単語）は `voice/` があるデッキだけ。DEK041（予算と実尺のずれ）は Timeline があるデッキだけ。どちらも警告。ライブ専用デッキの「lint 通過 = 完成」は変わらない。

## 出力

診断は SARIF 2.1.0 に統一する。rumdl の `runs[]` とマージするため、VS Code、CI、AI エージェントがすべて同じ形式を読む。人間向けには ESLint 風のテキストが既定。

```bash
dek lint --format sarif > results.sarif
```

ルールの全表は [Lint ルール](/reference/lint) を見る。

## 次

本番の送り方 → [発表](./present)
