# 49. Have dekc mv record each rename in a committed .dek/renames.json

Date: 2026-11-12

## Status

Accepted

## Context

A comment on dek.pub names its slide by slug, as `dekc annotations` and `dekc shot` do. When an author renames a section with `dekc mv intro opening`, the next version uploaded has no slide `intro`, and every comment on it would come loose. The server can guess by title or by position, but a guess is wrong exactly when it matters: after a reorder and a rename together. The rename itself is known for certain at one moment only, when `dekc mv` makes it.

The version upload in `src/pub/protocol.ts` already has a `renames` field, and `src/core/renames.ts` keeps them in `.dek/renames.json`, by deck, oldest first. What was left was who writes it, when, and whether it is kept with the project.

`dekc mv` changes several files and promises that all change or none do (criterion 7 of the Agent Usability Criteria). A rename that moved the files but failed to record would publish later as a guess; a record without the rename would move comments to a slide that is not there.

## Decision

**`renameSection`, which `dekc mv <old> <new>` runs, records the rename as the last of its file steps.** The record is planned before any step runs, so a `.dek/renames.json` that does not read refuses the rename with that file's error and its hint, and nothing changes. It is written after every other file moved, inside the same all-or-nothing run, so a record that cannot be written takes the rename back, and a rename that is taken back leaves no record; a file that did not exist before is removed again.

- **What counts as a rename.** A rename of a section's id, including one finished from a heading edited first, where `dekc mv` moves only the files. A reorder (`--before`, `--after`) renames nothing and records nothing. A rename already done, which moves no file, is not recorded a second time.
- **Each entry is `{ from, to, at }`** under the deck's folder name, `at` the time of the rename in ISO 8601. The file is the whole history, oldest first; which entries are new since a version is the publishing side's to work out.
- **The file is committed with the project.** It is not in `LOCAL_STATE` in `src/cli/files.ts`, so neither the `.gitignore` that `dekc init` writes nor the lines `dekc sync` adds to an older one ignore it. dek already names each file it keeps for itself apart (`.dek/server.json`, `.dek/marks.json`, `.dek/annotations.json`) instead of ignoring `.dek/` whole, because `.dek/schema.json` and `.dek/slide.d.ts` are committed; `renames.json` joins those. A publish from another checkout, or from CI, then sends the same renames as the author's machine would.
- **`dekc mv --json` is unchanged.** Its rename form already prints `from` and `to`, which is what was recorded; the time is the one field more, and nothing an agent does next depends on it.

**What was not chosen:**

- **Recording from `mvCommand` after the rename returns.** It is the only caller today, but a rename that succeeded and a record that failed would be the half-done state criterion 7 rules out, and a second caller would have to remember to record.
- **Keeping the renames in local state, ignored by git.** A comment's slide would then follow a rename only when the same checkout that ran `dekc mv` publishes, which a team or a CI publish does not.
- **Working the renames out on the server from two versions.** Matching by title, script, or position is the guess this record replaces; the server can still guess for a rename made by hand outside `dekc mv`.
- **Pruning the file once a version is uploaded.** The record would then depend on which remote was published to, and a second remote, or a deck published later from an older checkout, would lose renames.

## Consequences

- Every `dekc mv <old> <new>` touches `.dek/renames.json`, which shows in `git status` beside the moved slide; the reference for `dekc mv` and the project layout in the guide say to commit it.
- A project whose own `.gitignore` ignores `.dek/` whole keeps the file out of git; renames then follow comments only from the checkout that made them, as with local state. dek does not rewrite such a line.
- The file only grows. Its size is a few dozen bytes per rename, which a talk makes a handful of.
- A `.dek/renames.json` broken by hand stops `dekc mv` from renaming until it is fixed or deleted, as its error says; deleting it costs only the comment moves it would have given.
