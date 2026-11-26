# dek.pub

[dek.pub](https://dek.pub) のサーバー実装です。[dek](../../README.ja.md) で作ったトークを、スライドビューアと台本記事として公開し、レビューコメントを受け付けます。集まったコメントは `dekc pub comments` で作者のターミナルや AI エージェントへ持ち帰れます。

Cloudflare Workers 上の [Void](https://void.cloud) アプリで、Svelte 5・D1・R2 を使っています。`serve/` にはもう 1 つの Worker があり、各デッキを専用のオリジンから配信します。ローカル開発は Miniflare で完結するため、Cloudflare アカウントは不要です。2 つの Worker を支えるゾーンと DNS レコードは `infra/` に [Alchemy](https://alchemy.run) で宣言しています。

```bash
mise install         # Bun と、Void・Vite+ が動く Node.js
bun install          # リポジトリのルートで実行
cd apps/pub
bun run setup
bun run dev
```

別のターミナルからサンプルデッキを公開して動作確認できます。

```bash
cd sample
bunx dekc pub login --server http://localhost:5173
bunx dekc pub publish why-dek --server http://localhost:5173
```

構成と開発ルールは `AGENTS.md`、設計の背景はリポジトリルートの `adr/0042-*` と `adr/0043-*` を参照してください。未実装の項目は `TODO.md` にまとめてあります（とくにコメント周りは実装途上です）。

## ライセンス

AGPL-3.0。リポジトリの他の部分は MIT です（ルートの README を参照）。
