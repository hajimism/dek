# 40. Have dekc init install the running dek into the project, and Playwright with --browser

Date: 2026-11-11

## Status

Accepted

Amends [2. Keep the name dek and run it as dekc](0002-keep-the-name-dek-and-run-it-as-dekc.md)

## Context

ADR 2 says installs go through `bunx @hajimism/dek init` and then `bun add -d @hajimism/dek`. `init` wrote the project and printed five steps to run next: `cd` into it, `bun add -d @hajimism/dek`, `cd` into the deck, edit the script, and start the dev server. The rendered checks, which are what sets dek apart from the tools around it, need Playwright as well, and `init` named that install in a second block.

So a person or an agent had to run two installs by hand before `dekc lint --visual` measured anything. Every step that is typed by hand is a step that can be skipped. An agent that read `next` and skipped the browser block got lint without the rendered rules, and nothing in its first run showed it what it was missing. The step `bun add -d` also landed in the nearest `package.json` above the project. A project made inside another repository put dek into that repository's manifest.

Three earlier decisions bear on an install that `init` runs itself:

- ADR 19 keeps a seven-day wait on new versions in this repository only; projects that `init` writes get no such setting. An install `init` runs must not fetch code the author has not already chosen to run.
- ADR 28 lists Playwright as the user's own install, outside what dek controls.
- ADR 34 turned down a second npm package, partly because every release would carry a second pipeline. A `create-dek` package for `bun create dek` would be that second package.

## Decision

**`dekc init` installs dek into the project it writes.** After the files are written, it runs `bun add -d --ignore-scripts @hajimism/dek@<version>` in the project, where the version is the one that is running. Run through `bunx @hajimism/dek`, that is the code the author just ran, so the install fetches nothing new, and the project is pinned to it exactly. Run from a checkout of dek, it is the published version with the same number, or nothing, when that number is not published yet. It does not run when the project, or a directory above it, already has dek in `node_modules`, or when `--no-install` is given.

**`init` writes a `package.json` of its own**, `{ "private": true }`, so the install lands in the project. Once an install has written to it, it differs from what `init` writes; a second `init` keeps it and does not list it as kept.

**`init` runs no one's scripts, and installs only into its own `package.json`.** `init` may run in a folder that is not the author's, such as a cloned project. Before this decision it only wrote files; an install would run that folder's `package.json` lifecycle scripts and install its dependencies. So every `bun add` passes `--ignore-scripts`, and dek is installed only when the `package.json` is the one `init` wrote. In a folder that already had one, `init` leaves the install to the author and says so.

**`--browser` installs Playwright and Chromium,** with `bun add -d --ignore-scripts playwright` when the project lacks it, and `bunx --bun playwright install chromium` every time, after dek. Chromium's install does nothing once the browser is there, so a download cut short is finished by running `init --browser` again. When the dek that runs is in a folder above the project, it would not find a Playwright installed in the project, so `init` installs none and says where to install it. Playwright stays the author's choice, as ADR 28 has it: it is downloaded only when the flag is given, and the flag is a consent the author types, as `--accept` and `DEK_ALLOW_UNSANDBOXED` are. `--bun` runs Playwright's installer on Bun, which every dek machine has, instead of on Node, which a Bun-only machine may lack. dek finds Playwright beside its own install, so `--browser` with `--no-install` in a project without dek is refused before anything is written.

**An install that fails leaves the project as written.** The files are valid without dek in `node_modules`. `--json` lists what ran in `installed` and what did not in `notInstalled`, each entry with `install` (`dek` or `browser`) and `reason`. Text output prints the first under `installed:` and the second on stderr. `next` names `bun add -d @hajimism/dek` whenever dek is still not in the project, and `playwright` names Playwright's install whenever the browser did not go in. The reason is bun's first error, which names the cause: a version that the author's own `minimumReleaseAge` refuses fails here, and the reason says so. The hint other commands print when Playwright is missing gains `--bun` for the same reason as above.

**What was not chosen:**

- **A `create-dek` package for `bun create dek`.** It reads well. It would also be a second package, which ADR 34 turned down: release-please set up for two packages, a trusted publisher registered by hand on npmjs.com, and a name npm may refuse as too close to others, as it refused `dekc`. With `init` doing the installs, `bunx @hajimism/dek init` already starts a project in one command.
- **Reusing `skipped` for a failed install.** `skipped` is for checks, and adding `install` to its `check` values would widen a value lint, check, and build already return, which ADR 31 counts as breaking.
- **Installing the browser by default.** Chromium is a download of more than a hundred megabytes, and ADR 28 leaves Playwright to the user.
- **Asking at a prompt.** No dek command prompts; an agent runs without a terminal, and a flag works the same for both.

## Consequences

- **The quickstart is one command, then the deck:** `bunx @hajimism/dek init my-talks --deck <name>`, `cd my-talks/decks/<name>`, and `bunx dekc`. With `--browser`, the first `dekc lint --visual` measures.
- **`init` reaches the network, and writes a `package.json`.** Offline, it writes the project and says that the install did not run. Tests and the agent eval pass `--no-install`; `scripts/check-package.sh` does too, since it installs the tarball under test instead of the registry's.
- **A project is pinned to an exact version.** Moving to a newer dek is `bun add -d @hajimism/dek@<version>` in the project, a step the author takes on purpose.
- **ADR 2's install sentence now reads as one command:** the package and the bin names it decided stay as they are.
- **`--json` for init gains `installed` and `notInstalled`;** nothing it printed before is taken away or changed.
