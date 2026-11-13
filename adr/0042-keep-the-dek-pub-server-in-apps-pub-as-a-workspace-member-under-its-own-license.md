# 42. Keep the dek.pub server in apps/pub as a workspace member, under its own license

Date: 2026-11-12

## Status

Accepted

## Context

dek.pub is a service that publishes talks built with dek: it takes what `dekc pub publish` builds, serves the deck from an origin of its own, renders the script as an article, and returns review comments to the author's agent. Its server and the CLI change together. The HTTP shapes, the slide map, and the embed API are one contract with two sides, and a change to one side without the other breaks the round trip that is the point of the service.

The CLI is published to npm as `@hajimism/dek` under MIT. The server is not published; it is deployed. Three licensing questions follow from putting them side by side:

- A built deck is a single HTML file that carries dek's runtime and theme. An author who shares the file shares that code, and MIT asks that its notice be kept, which nobody does with a slide deck.
- The server is the part a third party could run as a competing hosted service without giving anything back.
- The two must not blur: the CLI must never depend on the server's code, or the server's license would reach the package.

The root `package.json` had no workspaces. Until ADR 41 a root `overrides.vite` forced every Vite in the install to 6, and the server needs Vite 8.

## Decision

**The server lives in `apps/pub/`, in this repository, as a member of the root Bun workspace.** `apps/pub` is the Void app and `apps/pub/serve` is the serve Worker; both are listed in `workspaces`. There is one `bun.lock`, one Dependabot entry, and one `minimumReleaseAge`. The install uses Bun's isolated linker (`linker = "isolated"` in `bunfig.toml`), so a peer dependency resolves to its dependent's version: VitePress gets Vite 8.3 and the Void app gets Vite+'s Vite.

**What the CLI and the server share is `src/pub/protocol.ts`, and only that.** It holds zod shapes and paths and does no I/O. The server imports it by a relative path. Dependencies point one way: `apps/` may import from `src/`, and `src/` never imports from `apps/`.

**Licenses:**

- The package stays MIT.
- `src/runtime/` and `src/theme/`, which dek copies into every built deck, are MIT No Attribution (MIT-0), each with a `LICENSE` file in its folder. A deck can be shared with no notice attached. Every commit to those folders is by the project's author, so no other contributor's consent is needed.
- `apps/pub/` is AGPL-3.0 (`apps/pub/LICENSE`, `"license": "AGPL-3.0-only"` in its two package files), so a hosted copy of the server shares its changes.

**What was not chosen:**

- **A separate repository for the server.** The protocol would need a package of its own, or two copies kept in step by hand, and every change to the round trip would be two pull requests.
- **`apps/pub` as a standalone package with its own lockfile.** It was the way around the root `vite` override. With the override gone (ADR 41), it would only add a second install and a second place to set the release-age wait.
- **MIT for the runtime.** It asks for a notice in every shared deck, which in practice is never kept.
- **The hoisted linker.** One `vite` would be hoisted, and the Void app would load Vite 8.3 under Vite+, two copies of the same module.

## Consequences

- Biome, knip and the CI jobs cover `apps/pub` from the root. knip has a workspace entry for it, with its Vite plugin off, since loading the app's `vite.config.ts` starts Void.
- `bun.lock` gains `configVersion` and the workspaces; `bun install --frozen-lockfile` reads it on Bun 1.4.0, which CI pins.
- A contributor to `src/runtime/` or `src/theme/` contributes under MIT-0, and one to `apps/pub/` under AGPL-3.0.
- The npm tarball still holds `src/` only; `apps/` is not in `files`.
