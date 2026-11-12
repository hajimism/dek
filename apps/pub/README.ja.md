# dek.pub

[dek.pub](https://dek.pub) のサーバーです。[dek](../../README.ja.md) で作ったトークを、めくれるデッキと読める台本として公開し、レビューのコメントを受け付けます。コメントは `dekc pub comments` で作者のエージェントに戻ります。

Cloudflare Workers 上の [Void](https://void.cloud) アプリで、Svelte 5、D1、R2 を使います。`serve/` にはもう 1 つの Worker があり、デッキをそれぞれ専用のオリジンから配信します。開発は Miniflare によってすべて手元で動き、Cloudflare のアカウントは要りません。

```bash
mise install         # Bun と、Void と Vite+ が動く Node
bun install          # リポジトリのルートで
cd apps/pub
bun run setup
bun run dev
```

別のターミナルから、サンプルのデッキを公開できます。

```bash
cd sample
bunx dekc pub login --server http://localhost:5173
bunx dekc pub publish why-dek --server http://localhost:5173
```

構成と決まりは `AGENTS.md` に、この作りにした理由はリポジトリのルートの `adr/0042-*` と `adr/0043-*` にあります。

## ライセンス

AGPL-3.0。リポジトリのほかの部分は MIT です（ルートの README を参照）。
