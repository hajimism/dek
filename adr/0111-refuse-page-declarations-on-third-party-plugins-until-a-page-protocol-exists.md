# 111. Refuse page declarations on third-party plugins until a page protocol exists

Date: 2026-11-26

## Status

Accepted

Amends [33. Show a plugin's page in the player and builds behind page API 1](0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md)

## Context

[ADR 33](0033-show-a-plugin-s-page-in-the-player-and-builds-behind-page-api-1.md) introduced `page` in plugin manifests behind Page API 1, and deferred how third-party plugins ship a browser script. Under that decision, dek accepted and pinned a third-party plugin's `page` declaration into `plugins/<name>/plugin.json`, and `pluginsSection()` wrote `Its page takes the key …` into `AGENTS.md`, while `pluginPages()` silently dropped every plugin whose script dek did not bundle.

That violates the Agent Usability Criteria:

- **Criterion 1 & 2 (Accurate guidance / Conventions match checks):** `AGENTS.md` advertised page keybindings that never loaded in the player or build.
- **Criterion 7 (Safe operations):** `dekc sync` silently accepted a `page` declaration it could never honor instead of rejecting it when given.

At the same time, two small drifts existed between `@hajimism/dek/plugin` (`src/plugin-api.ts`) and runtime validation: `PluginRules<Prefix>` accepted arbitrary numbers (`${Prefix}${number}`) instead of the three digits runtime enforces (`^${prefix}\d{3}$`), and `readSarif()` did not check `version === "2.1.0"` even though `CheckOutput` requires it.

## Decision

**Refuse `page` on non-bundled plugins as `unsupported`.**

- `readManifest()` and `readLock()` accept `{ allowPage?: boolean }` (defaulting to `true` for pure validation). `plugin-host.ts` passes `allowPage: true` only for official plugins that ship a page (`BUNDLED[name]?.page !== undefined`).
- When a non-bundled plugin declares `page`, `readManifest()` returns `{ ok: false, unsupported: true, reason: "it declares a page; this dek only carries pages for official plugins" }`.
- `dekc sync` reports the plugin with existing status `"unsupported"` and hint `"update dek"`, writing no lock and adding no dead keybindings to `AGENTS.md`.
- An existing lock for a non-bundled plugin that already pinned `page` fails `readPluginLock()` as `unsupported`, so `pinnedPlugins()` omits its manifest from `AGENTS.md` and `pluginChecks()` skips it with hint `"update dek"`.

**Keep `@hajimism/dek/plugin` types and runtime validation aligned:**

- Narrow `PluginRules<Prefix>` to `Partial<Record<`${Prefix}${Digit}${Digit}${Digit}`, PluginRule>>` so non-3-digit rule IDs fail typechecking at compile time, matching `ruleProblem()`.
- Enforce `version === "2.1.0"` in `readSarif()`, reporting a mismatch as `DEK046`.

**What was not chosen:**

- **Shipping a third-party page script protocol now.** Carrying third-party browser JS into built and published decks requires vendoring, content hashing in `plugin.json`, size/timeout limits, and a Content-Security-Policy (ADR 33). That remains a separate decision.
- **Continuing to pin third-party `page` while hiding it from `AGENTS.md`.** A plugin author running `dekc sync` would still get no diagnostic explaining why their `page` never runs.
- **Introducing a new `PluginSync.status` enum value.** Adding an enum value to `--json` is a breaking change under [ADR 31](0031-fail-a-pull-request-that-narrows-json-without-a-commit-marked-breaking.md). Reusing `"unsupported"` matches how a future dek that adds a third-party page protocol will accept the same manifest.

## Consequences

- `dekc sync` never writes dead page keybindings to `AGENTS.md` or silently ignores a third-party `page` declaration.
- No `--json` contract changes (`PluginSync.status` keeps its existing values).
- Third-party plugins that do not declare `page` are unaffected, and official plugins with a bundled page (`dek-study`) continue to work unchanged.
- Plugins printing SARIF without `"version": "2.1.0"` now fail with `DEK046`, matching `CheckOutput`.
