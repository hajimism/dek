# Projects and Decks

A **project** holds many **decks**. This page explains the boundary between the two, why the theme is copied rather than shared, and how dek decides which deck a command applies to.

## One project, many decks

```
my-talks/                       # project (dek init)
├── dek.toml                    # lint thresholds, speaking rate, voice defaults
├── .gitignore                  # dist/, .cache/, .dek/server.json
├── .rumdl.toml                 # Markdown rules for script.md
├── theme.css                   # the starting point for new decks
├── AGENTS.md                   # conventions for agents (written by sync)
├── tsconfig.json               # editor types for slide scripts (written by dek init)
├── assets/                     # shared source material; decks copy what they use
├── decks/
│   └── 2026-04-vite/           # deck (dek new)
│       ├── script.md           # the single source of truth
│       ├── theme.css           # this deck's own copy
│       ├── slides/             # one HTML file per section, plus optional .css / .ts
│       ├── assets/             # everything the slides reference
│       ├── dist/               # build, pdf, and video output
│       └── .cache/             # screenshots, voice, and video intermediates
└── .dek/
    ├── schema.json             # frontmatter schema, regenerated on sync
    └── slide.d.ts              # the DekSlide type, regenerated on sync
```

The `decks/` directory always exists, even with one deck. The CLI, the dev server, and any agent resolve paths the same way in every project.

A deck is self-contained. Nothing inside `decks/2026-04-vite/` refers to anything outside it. The project is where decks live; it is not a runtime they depend on. Copy the directory, zip it, or open it years later and it renders the same.

## Themes are copied, not shared

The project's `theme.css` is a template. `dek new` copies it into the new deck, and from then on the deck owns its copy.

```bash
dek new 2026-09-dek
dek new 2026-09-dek --theme-from 2026-04-vite
```

Consider the alternative. If decks shared one theme, polishing it in September would change how April's deck renders. A heading that used to fit on one line would wrap, and lint would start warning about a talk you gave five months ago. A finished talk should stay finished. A physical copy is the most reliable way to guarantee that.

When a deck's theme is worth keeping, promote it with `cp`. There is no dedicated command.

```bash
cp decks/2026-09-dek/theme.css theme.css
```

Your past decks are a theme library you never have to maintain.

The same rule applies to `assets/` and to voice. The project's `assets/` holds source material; a deck copies what it uses into its own `assets/`. When `dek.toml` has a `[voice]` table, `dek new` copies it into the deck as `voice/voice.toml`, so changing the speaker in September leaves April's narration alone.

## Where you run a command decides its scope

dek finds the project root by walking up from the current directory until it finds `dek.toml`, the same way Cargo finds a workspace.

| Where you run it | What it applies to |
| --- | --- |
| Project root | Every deck |
| Inside a deck | That deck |
| Anywhere, with a deck name or `--deck <name>` | The named deck |

From the project root, `dek lint` lints every deck and `dek build` builds every deck. Commands that need exactly one deck, such as `dek show intro`, ask you to name it. The deck name can be a positional argument: `dek show 2026-04-vite intro`, `dek lint 2026-04-vite`, `dek 2026-04-vite`.

Running `dek new` outside any project stops and points you at `dek init`.

## Next

The rules for the file every deck is built from: [The Script](./script).
