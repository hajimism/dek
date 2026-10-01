## What and why

<!-- What this changes, and the problem it solves. Link the issue if there is one. -->

## Checks

- [ ] The title is a Conventional Commit (`feat:`, `fix:`, `docs:`…, `!` if it breaks something)
- [ ] `bunx biome ci .`, `bun run typecheck`, `bun run knip`, and `bun test` pass
- [ ] Docs updated in both English and Japanese, if behavior or output changed
- [ ] `bun run schema` rerun, if a command's `--json` shape changed
- [ ] An ADR in `adr/`, if this makes or changes a design decision that bears on a release
