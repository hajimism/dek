---
name: dek
description: Write and fix talks with dek, a build system for talks run as `dekc` on Bun - script first in script.md, one small HTML file per slide, checked by lint and screenshots until lint passes. Use when a project has dek.toml or decks/*/script.md, or when asked to make, fix, or hand over slides for a talk with dek.
---

# dek

dek builds a talk from its script. `script.md` holds what will be said, in order; each `##` heading is one slide, written as one small HTML file, and lint checks everything a rule can measure. This skill is the loop. The installed dek tells you the rest, and it wins whenever the two disagree.

## Run it as `dekc`, on Bun

- The package is `@hajimism/dek`; the command is `dekc`. Never `bunx dek` or `npx dek`: `dek` on npm is an unrelated package that would be downloaded and run.
- dek runs on Bun. Inside a project, `bunx dekc`; outside one, `bunx @hajimism/dek`. Not `npx`, not `node`.
- No project yet: `bunx @hajimism/dek init <dir>`, then `cd <dir>`; where dek is already installed, `bunx dekc init <dir>` does the same.
- Decide from `--json`: every result command takes it. Branch on `ok`; an error carries a `hint` with the next command to run. Never scrape a verdict from the text output. `show` and `theme` print text meant to be read, and take `--json` too.

## First, ask the dek you have

1. `bunx dekc --version` and `bunx dekc help --agent`: every command and flag of the dek installed in this project. This file names few on purpose; use only what that list shows.
2. Read dek's block in `AGENTS.md`. dek rewrites it for the installed version: the conventions lint checks, how to check a slide, and what to do before reporting a deck as done. Follow it as written.
3. In the deck, `bunx dekc theme`: the classes, tokens, and layouts this deck's theme defines, and `bunx dekc theme <layout>` for a layout's markup. Use nothing else.

## Script first

Write or change `script.md` before any slide: `##` is a slide, `###` a beat, and paragraphs are what is said. `bunx dekc sync` writes a skeleton for each new section, and removes the skeletons nobody edited whose section is gone; it never touches a slide you edited. Keep the order and what is said in the script; a slide shows it. `bunx dekc ls` estimates the talk's length from the script against the `duration` in its frontmatter.

## One slide at a time

1. `bunx dekc show <slug>`: the slide's section of the script, its files, and the theme rules it uses.
2. Edit `slides/<slug>.html`, and `slides/<slug>.css` for what only this slide needs.
3. `bunx dekc check <slug> --shot --json`: fix every error, then open the shot it names. Read its `fill` before judging the shot.
4. Next slide. When all are written, `bunx dekc lint --visual --json`, which reports every problem in one run.

A hint that sends a fix to `theme.css` means every slide of the deck shares the problem: fix it in the deck's own `theme.css`.

## When to stop

- `bunx dekc lint --visual` reports no errors. Warnings do not fail it; read them and decide. A check listed in `skipped` did not run: say so, with its hint, rather than count it as passed.
- You have looked at `bunx dekc shot --sheet` and judged the deck's balance.
- Say what you could not judge, such as the argument and how the timing feels when spoken, and hand it back to the author. Passing lint means nothing measurable is wrong, not that the talk is good.

## When the human points at something

If the human marked beats while rehearsing or pointed at elements of a slide, `bunx dekc help --agent` lists the commands that read those notes, and `AGENTS.md` says how to use them. Leave clearing them to the human.
