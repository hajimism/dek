# CLI

Install with `bunx github:hajimism/dek` and pin with `bun add github:hajimism/dek`; see [Getting Started](/guide/getting-started). The examples below write `dek` for what is really `bunx dek`, or `bunx github:hajimism/dek` before pinning.

## Conventions

- **Scope follows the working directory.** The project root means every deck; a deck directory means that deck. From anywhere, name a deck as the first argument or with `--deck <name>`: `dek lint why-dek`, `dek show why-dek intro`, `dek why-dek`. Details in [Projects and Decks](/guide/structure#where-you-run-a-command-decides-its-scope).
- **Result commands accept `--json`.** Success is `{ "ok": true, ... }`. Failure is `{ "ok": false, "error": { "message", "path", "line", "hint" } }` with exit code 1. `dek` and `dek rehearse` stay running and do not take `--json`.
- **Diagnostics are SARIF** with `dek lint --format sarif`. The default is ESLint-style text.
- **`init` and `sync` never overwrite.** They create what is missing and warn about what is left over. Neither renames.
- **Every error carries a hint** naming the next command to run.
- **`--json` and `--deck` are global.**

## Development

| Command | Purpose |
| --- | --- |
| `dek [deck] [--visual]` | Start the dev server: sync, live reload, lint on save, presenter view. `--visual` adds overflow and contrast on save. |
| `dek --remote [--password PWD]` | Serve on the LAN. The presenter view, `goto`, and `current` require the password; one is generated if omitted. |
| `dek rehearse [slug]` | Auto-advance from the Timeline. Records nothing. |

## Project

| Command | Purpose |
| --- | --- |
| `dek init [dir] [--deck NAME]` | Create a project in `dir` (default: the current directory), optionally with a first deck. Writes `dek.toml`, `theme.css`, `.gitignore`, `.rumdl.toml`, `assets/`, `decks/`, and `.dek/schema.json`. |
| `dek new <name> [--theme-from DECK]` | Add a deck. Copies the project `theme.css`, or the named deck's. |
| `dek ls [deck]` | List decks, or summarize one: sections, slides, diagnostics, budget, estimate, and narrated length when a Timeline exists. |

## Slide

| Command | Purpose |
| --- | --- |
| `dek show <slug>` | Print a section's script and HTML. `html` is `null` when the file is missing. |
| `dek check <slug> [--shot] [--voice]` | Lint one slide, including rendering rules when Playwright is available. `--shot` writes a screenshot and returns its path. `--voice` returns kana and durations. |
| `dek shot [slug] [--step <id\|n>]` | Screenshot one slide, or every slide, at the last beat by default. Files are `.cache/shots/<slug>[-<step>].<hash>.png`; the hash is of the rendered content, so a changed theme or slide yields a new path and the stale image is removed. |
| `dek shot <a> --to <b> [--at 0..1]` | One frame of the View Transition from the last beat of `a` into `b`, frozen at `--at` (default 0.5). Written to `.cache/shots/<a>-to-<b>-<at>.<hash>.png`. Does not combine with `--step`. |
| `dek mv <old> <new>` | Rename a section id and its HTML file. Heading text is untouched. Refuses if the destination exists. |
| `dek mv <slug> --before\|--after <other>` | Reorder a section in `script.md`. |
| `dek goto <slug>` | Jump the open browser. Requires a running dev server. |
| `dek current` | Print the slide on screen. Requires a running dev server. |
| `dek sync` | Create missing skeleton slides, refresh `AGENTS.md` and `.dek/schema.json`. Never overwrites. |

## Output

| Command | Purpose |
| --- | --- |
| `dek lint [--fix] [--visual] [--format sarif]` | Lint. `--fix` creates missing skeletons. `--visual` adds overflow and contrast. |
| `dek cues` | Print the spoken cues as `Cue[]`. Paragraphs only. No engine needed. |
| `dek voice` | Synthesize changed sentences into `.cache/voice/`. Also runs on save. |
| `dek voice speakers` | List the engine's speakers. |
| `dek voice say TEXT` | Speak one sentence. |
| `dek voice dict add WORD KANA` | Add a reading to `voice/dict.toml`. |
| `dek voice pin` | Copy the master audio and `timeline.json` into `voice/pin/`. |
| `dek build [--root-dist]` | Write one HTML file to `decks/<deck>/dist/<deck>.html`, or `<root>/dist/<deck>.html` with `--root-dist`. |
| `dek video [slug] [--fps N] [--root-dist]` | Bake `dist/<deck>.mp4` with `.vtt`, `.chapters.txt`, and `.credits.txt`. One slide goes to `.cache/video/<slug>.mp4`. |
| `dek pdf [--root-dist]` | Write `dist/<deck>.pdf` with every slide at its last beat. |
| `dek help [--agent]` | Help. `--agent` is the compact reference for agents. |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DEK_PLAYWRIGHT` | Path to an alternative Playwright worker script. |
| `DEK_RUMDL` | Path to the rumdl binary, ahead of `PATH` and `node_modules/.bin`. |
| `DEK_VOICE_URL` | Base URL of the speech engine, overriding `voice.toml`. |
