# FAQ

## どう入れるか

npm には載せていない。GitHub から実行する。

```bash
bunx github:hajimism/dek
```

トーク用プロジェクトに固定するなら `bun add github:hajimism/dek`。固定したあとは `bunx dek`。手順は [はじめる](./getting-started) を見る。

## Slidev を使うべきとき

ライブコーディング、スライド内の Vue コンポーネント、テーマの npm ギャラリー、埋め込みエディタが必要なら Slidev を使う。dek は喋りが主役のトーク向けで、素の HTML/CSS で完結することを強みとして維持する。比較は [なぜ dek か](./why#他のツールとの違い) を見る。

## HTML は必須か

必須ではない。`script.md` を書いて `dek` を叩けば骨格スライドが生え、同梱テーマのまま喋れる。HTML は、画面を台本以上のものにしたくなったときに書き始める。

## 声は必須か

必須ではない。`voice/` の無いデッキでは lint 通過 = 完成の定義は変わらない。声の診断（DEK040）は `voice/` があるデッキだけに足される。

## 連番のファイル名はなぜ無いか

順序を持つファイルは `script.md` ひとつにする。`slides/` のファイル名は id のみ。連番を付けると、並べ替えのたびにリネームが走り、差分が壊れる。並べ替えは `dek mv <slug> --before|--after <slug>`。

## `sync` は HTML を上書きするか

しない。足りないものを骨格として作り、余ったものを警告するだけ。リネームもしない。改名は `dek mv`。

## エージェントは何を叩くか

人間と同じ CLI。`dek help --agent`、`dek check <slug> --shot`、`dek lint --format sarif`。MCP サーバは持たない。[AI と作る](./ai) を読む。

## 開発サーバなしで発表できるか

できる。`dek build` の単一 HTML を USB に入れる。`?presenter` または `p` で手元のウィンドウが BroadcastChannel で追従する。別デバイスが要るときだけ `dek --remote`。

## Playwright / ffmpeg / VOICEVOX は必須か

任意依存。未検出ならそのコマンドだけが次の一手付きで失敗する。CLI 全体はいかなる場合も起動できる。`--visual` / `shot` / `pdf` / `video` は Playwright。`video` の結合は ffmpeg。`voice` / `rehearse` / `video` は VOICEVOX 互換エンジン。

## 待ち時間はどこに書くか

書かない。本文のないビートは遷移と `pause.beat` だけ通過する。デモの間に喋ることがあるなら、それを台本の段落に書く。書けば見積もりに入る。
