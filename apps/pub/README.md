# dek.pub

The server behind [dek.pub](https://dek.pub): it publishes talks built with [dek](../../README.md) as a deck you can page through, a script you can read, and a place to leave review comments that `dekc pub comments` hands back to the author's agent.

It is a [Void](https://void.cloud) app on Cloudflare Workers, with Svelte 5, D1 and R2, and a second Worker in `serve/` that serves each deck from an origin of its own. Development runs entirely on your machine through Miniflare; no Cloudflare account is needed.

```bash
mise install         # Bun, and the Node that Void and Vite+ run on
bun install          # at the repository root
cd apps/pub
bun run setup
bun run dev
```

Then publish a sample deck to it from another terminal:

```bash
cd sample
bunx dekc pub login --server http://localhost:5173
bunx dekc pub publish why-dek --server http://localhost:5173
```

See `AGENTS.md` for the layout and the rules, and `adr/0042-*` and `adr/0043-*` at the repository root for why it is built this way. `TODO.md` lists what it does not do yet; the comments in particular are still taking shape.

## License

AGPL-3.0. The rest of the repository is MIT; see the root README.
