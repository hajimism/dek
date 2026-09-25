# CLI

Create a project with `bunx github:hajimism/dek init`, then install dek into it with `bun add -d github:hajimism/dek`; see [Getting Started](/guide/getting-started). The examples below write `dek` for what is really `bunx dek` inside that project, or `bunx github:hajimism/dek` before installing. `bunx dek` anywhere dek is not installed runs `dek` from npm, an unrelated package.

## Conventions

- **Scope follows the working directory.** The project root means every deck; a deck directory means that deck. From anywhere, name a deck as the first argument or with `--deck <name>`: `dek lint why-dek`, `dek show why-dek intro`, `dek why-dek`. Details in [Projects and Decks](/guide/structure#where-you-run-a-command-decides-its-scope).
- **Result commands accept `--json`, with one envelope.** Success is `{ "ok": true, ... }`. Failure is `{ "ok": false, "error": { "message", "hint", "path", "line" }, ... }` with exit code 1, both when a command cannot run and when `lint` or `check` finds an error; `hint` is there whenever dek knows the next step, `path` and `line` when the failure has a place. Commands that report diagnostics (`lint`, `check`, `build`, `ls`, `cues`) carry `diagnostics` pass or fail, so a reader branches on `ok`, reads `error`, and then the diagnostics. `dek` and `dek rehearse` stay running and do not take `--json`. See [The JSON contract](/guide/ai#the-json-contract).
- **The shape is not frozen yet.** While dek is 0.x, the `--json` shape and the rule ids may change between releases. A rule id is never reused for another rule.
- **Diagnostics are SARIF** with `dek lint --format sarif`: `file://` URIs, line and column, the hint, slug, and data in `properties`, and skipped checks as tool execution notifications. The default is ESLint-style text, `path:line:column: id message`.
- **Only errors fail.** Each diagnostic has a `severity`. `lint` and `check` exit 1 with `"ok": false` when an error remains; warnings alone exit 0.
- **`init` and `sync` never overwrite your work.** They create what is missing and warn about what is left over. The only slides sync rewrites or removes are skeletons nobody has edited: rewritten when the script they came from changed, removed when their section is gone and no stylesheet or script sits beside them. In `AGENTS.md`, dek owns only the block between `<!-- dek:begin … -->` and `<!-- dek:end -->`. Neither renames.
- **Every error carries a hint** naming the next command to run. Diagnostics carry one too when the fix is known: the beat ids a `data-step` may use, the classes a slide may use, the `assets/` path for a remote image.
- **Paths into the source tree are relative to the working directory** in text and `--json` output: diagnostics, errors, and the files `init`, `new`, and `sync` create. Artifacts dek writes, such as a screenshot or a build, stay absolute. SARIF keeps absolute URIs.
- **A check that did not run is listed in `"skipped"`**, each entry with the `check`, the `reason`, and a `hint` when there is a way to run it: `dek check` without Playwright skips `visual`, `dek check --voice` on a deck without `voice/` skips `voice`, `dek lint` without rumdl skips `rumdl`, and `dek ls` on a ref skips `lint`. Text output prints `<check>: skipped (<reason>)` and the hint as `help:`. The field is absent when every check ran.
- **Commands that write one file per deck return a list.** `build` and `pdf` return `outs`, one path per deck in scope, one deck included.
- **A ref is read, never written.** `ls`, `show`, `theme`, and `shot` take a ref name (`owner/repo/deck`) where they take a deck; every other command refuses one. See [Refs](#refs).
- **Help is per command.** `dek help <command>`, `dek <command> --help`, and `-h` print its usage, what it does, and every flag it takes. `dek --version` (`-v`) prints the version. A mistyped command or deck name gets `did you mean …?`.
- **Flags are checked per command.** `--json`, `--help`, and `--version` go anywhere; every other flag only where its command takes it, and `--deck` everywhere but `new`, `ref`, and `help`. A misspelled flag, or one from another command, is an error whose hint lists the flags the command does take, not a silent no-op.

## Development

| Command | Purpose |
| --- | --- |
| `dek [deck] [--visual] [--port N]` | Start the dev server: sync on start and on every save, live reload, lint on save, presenter view. It answers only at `127.0.0.1` or `localhost`, and refuses a move (a WebSocket, `goto`) from another origin. `--visual` adds overflow and contrast on save. `--port` fixes the port; without it the OS picks a free one. It stops on Ctrl-C, or when the process that started it exits, so no server is left holding a port. |
| `dek --remote [--password PWD]` | Serve on the LAN. The presenter view, `goto`, `current`, the voice timeline and audio, and the streamed diagnostics require the password; a 10-letter one is generated if omitted. |
| `dek rehearse [slug] [--remote [--password PWD]]` | Auto-advance from the Timeline. Records nothing. `--remote` serves it on the LAN as `dek --remote` does. |

## Project

| Command | Purpose |
| --- | --- |
| `dek init [dir] [--deck NAME]` | Create a project in `dir` (default: the current directory), optionally with a first deck, and print the commands to run next (`next` in `--json`). Writes `dek.toml`, `theme.css`, `.gitignore`, `.rumdl.toml`, `tsconfig.json`, `assets/`, `decks/`, `AGENTS.md`, `.dek/schema.json`, and `.dek/slide.d.ts`. A first deck comes with a short starter script and its skeleton slides, so it passes lint as created; once you replace the script with your own, `dek sync` removes the example skeletons you left untouched. Nothing that exists is overwritten: a file already there is kept, and listed as kept when it differs (`created` and `kept` in `--json`); every input is checked before the first write. An `AGENTS.md` already there keeps what you wrote and gets dek's block added, as sync does. Refuses to run inside another project; add a deck with `dek new` there. The next commands include `bun add -d github:hajimism/dek` until the project has dek installed. |
| `dek new <name> [--theme-from DECK]` | Add a deck. Copies the project `theme.css`, or the named deck's, and creates its skeleton slides, so it passes lint as created. Prints the commands to run next (`next` in `--json`). |
| `dek ls [deck]` | List decks, or summarize one: sections, slides, diagnostics, budget, estimate, and narrated length when a Timeline exists. |

## Refs

A ref is someone else's deck, pinned in `dek.toml` `[refs]` to read as a model. Its snapshot under `refs/` is gitignored; whenever it is missing or at another commit, the next read fetches the pinned commit again. Public repositories need no token; for a private one, set `GITHUB_TOKEN` or sign in with `gh auth login`.

| Command | Purpose |
| --- | --- |
| `dek ref <owner/repo/deck>[@rev]` | Pin a ref to the default branch, or to the tag, branch, or sha after `@`, and fetch its snapshot. A GitHub link to the deck's folder works too. Run it again to move the pin to the latest; `--json` returns `rev`, `from`, and `changed`. Warns when the repository has no license. |
| `dek ref` | List the pinned refs: rev, title, slides, and which are not fetched. |
| `dek ref rm <ref>` | Drop the pin and the snapshot. |
| `dek ls <ref>` | Summarize a ref, timed at its own speaking rate. Lists `lint` in `skipped`: a ref is not yours to fix. |
| `dek show <ref> <slug>` | The same bundle as for a slide of your own, plus `ref`: name, rev, snapshot directory, and license file. |
| `dek theme <ref>`, `dek shot <ref> <slug>` | The ref's theme, and a screenshot of one of its slides. |

## Slide

| Command | Purpose |
| --- | --- |
| `dek show <slug>` | Print everything one slide is made of, each part labeled with its file: the section's script, `slides/<slug>.html`, `.css`, and `.ts`, the rules of the deck's `theme.css` the slide uses (with only the tokens and keyframes they reach), and the assets it references. A missing file is `null`. |
| `dek theme [layout]` | List the layouts, classes, and tokens the deck's own `theme.css` defines. With a layout, print its example markup, ready to paste into `slides/<id>.html`. |
| `dek check <slug> [--shot] [--voice]` | Lint one slide, including rendering rules when Playwright is available. `--shot` writes a screenshot and returns its path. `--voice` returns kana and durations; on a deck without `voice/` it lists `voice` in `skipped` with how to set it up, and the rest of the check still runs. |
| `dek shot [slug] [--step <id\|n>]` | Screenshot one slide, or every slide, at the last beat by default. Files are `.cache/shots/<slug>[-<step>].<hash>.png`; the hash is of the rendered content, so a changed theme or slide yields a new path and the stale image is removed. |
| `dek shot <a> --to <b> [--at 0..1]` | One frame of the View Transition from the last beat of `a` into `b`, frozen at `--at` (default 0.5). Written to `.cache/shots/<a>-to-<b>-<at>.<hash>.png`. Does not combine with `--step`. |
| `dek mv <old> <new>` | Rename a section id, its HTML file and `data-slug`, its `.css` and `.ts` if present, and its keys in `voice/voice.toml`. Heading text is untouched. Refuses if any destination exists; all files change or none do. |
| `dek mv <slug> --before\|--after <other>` | Reorder a section in `script.md`. |
| `dek goto <slug>` | Jump the open browser. Requires a running dev server. |
| `dek current` | Print the slide on screen. Requires a running dev server. |
| `dek sync` | Create missing skeleton slides, refresh skeletons nobody has edited since, remove untouched skeletons whose section is gone (unless a `slides/<id>.css` or `.ts` sits beside them), and refresh dek's block in `AGENTS.md`, `.dek/schema.json`, and `.dek/slide.d.ts`. Never touches a slide you edited, what you wrote in `AGENTS.md` outside dek's block, or `tsconfig.json`. `--json` returns `created`, `updated`, and `removed`. |

## Output

| Command | Purpose |
| --- | --- |
| `dek lint [--fix] [--visual] [--format sarif]` | Lint. `--fix` runs `dek sync` first. `--visual` adds overflow and contrast. |
| `dek cues` | Print the spoken cues as `Cue[]`. Paragraphs only. No engine needed. |
| `dek voice` | Synthesize changed sentences into `.cache/voice/`. Also runs on save. |
| `dek voice speakers` | List the engine's speakers. |
| `dek voice say TEXT` | Speak one sentence. |
| `dek voice dict add WORD KANA [--accent N]` | Add a reading to `voice/dict.toml`, with the accent position when given. |
| `dek voice pin` | Copy the master audio and `timeline.json` into `voice/pin/`. |
| `dek build [--root-dist]` | Write one HTML file to `decks/<deck>/dist/<deck>.html`, or `<root>/dist/<deck>.html` with `--root-dist`. Slide stylesheets and scripts are inlined. Lint never stops a build: a section with no HTML is built from its skeleton, and when lint finds something, the output says how many and `--json` includes the diagnostics. |
| `dek video [slug] [--fps N] [--root-dist]` | Bake `dist/<deck>.mp4` with `.vtt`, `.chapters.txt`, and `.credits.txt`, from the Timeline `dek voice` writes. One slide goes to `.cache/video/<slug>.mp4`. `--fps` defaults to 30. |
| `dek pdf [--root-dist]` | Write `dist/<deck>.pdf` with every slide at its last beat. |
| `dek help [command] [--agent]` | Help, or one command's usage and flags. `--agent` is the compact reference for agents. A word that is no command fails as `dek <word>` does, with `did you mean …?`. |

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DEK_FFMPEG` | Path to the ffmpeg binary that `dek video` muxes with, instead of `ffmpeg` on `PATH`. |
| `DEK_GH` | Path to the `gh` CLI that `dek ref` asks for a token when `GITHUB_TOKEN` is unset. |
| `DEK_GITHUB_API` | Base URL of the GitHub API that `dek ref` fetches from. |
| `DEK_PLAYWRIGHT` | Path to an alternative Playwright worker script. |
| `GITHUB_TOKEN` | Token `dek ref` sends to GitHub, for private repositories and a higher rate limit. |
| `DEK_RUMDL` | Path to the rumdl binary, ahead of `PATH` and `node_modules/.bin`. |
| `DEK_VIDEO` | Path to an alternative video capture worker, used instead of the Playwright worker. |
| `DEK_VOICE_PLAY` | Set to `0` to keep `dek voice say` from playing the audio it synthesized. |
| `DEK_VOICE_URL` | Base URL of the speech engine, overriding `voice.toml`. |
| `NO_COLOR` | Set to turn colored output off, ahead of `FORCE_COLOR` and `CI`. |
| `FORCE_COLOR` | Set to color output even when it is not a terminal. |
| `CI` | Set, as CI services do, to turn colored output off unless `NO_COLOR` or `FORCE_COLOR` decides first. |
