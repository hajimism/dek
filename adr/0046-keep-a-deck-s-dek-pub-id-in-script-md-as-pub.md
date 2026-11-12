# 46. Keep a deck's dek.pub ID in script.md as pub

Date: 2026-11-12

## Status

Accepted

## Context

`dekc pub publish` uploads a deck to dek.pub. The first upload makes a remote deck, and every later one must land on the same deck, or each publish would start a new one and lose its comments and its URL. So the project has to remember which remote deck a local one is.

Three places could hold that:

- **A file of dek's own, such as `.dek/pub.json`.** It is apart from what the author writes, but a second file per deck is one more thing to commit, and a deck folder copied to another project would arrive without it.
- **`dek.toml`.** It is the project's settings, not a deck's; keying a table by deck folder breaks when a folder is renamed.
- **The frontmatter of `script.md`.** It already says what the talk is: its title, event, date, language, and the budgets it is judged by (ADR 4). The ID travels with the deck wherever the folder goes, and a publish from a new clone finds it.

DEK008 flags every frontmatter key the schema does not name, so whatever dek writes there has to be part of the schema.

## Decision

**The frontmatter key `pub` holds the deck's ID on dek.pub**, the string the protocol calls `DeckId`: `d_` and then 10 to 32 lowercase letters and digits. It is in the zod `Frontmatter`, so DEK008 does not flag it and `.dek/schema.json` documents it; a value of another shape stops the script from being read, with a message that says what to write and that deleting the line makes a new deck.

**`dekc pub publish` writes it**, once, after dek.pub has made the deck and before the version is uploaded: an upload that fails still leaves the ID, and the next publish lands on the same deck. Its result says that script.md changed and should be committed.

**The write changes only that line.** A `pub:` line already there is replaced, with any indented lines that continue its value; otherwise the line goes last in the frontmatter, before the closing `---`. Every other byte stays as it was: comments, key order, quoting, a byte order mark, and CRLF line ends. A script with no frontmatter gains one. The helper is `withFrontmatterKey` in `src/core/frontmatter-key.ts`, which reads no YAML and so cannot reformat it.

**What was not chosen:**

- **Writing the frontmatter back through a YAML library.** It would drop comments, such as the `$schema` line `dekc new` writes, and reorder or requote what the author wrote.
- **The slug as the key.** A slug is what the author may change on dek.pub; the ID never changes.

## Consequences

- A deck folder carries its link to dek.pub with it. Two folders that hold the same `pub:`, such as a copy of a deck, publish onto the same remote deck; deleting the line in the copy makes it a deck of its own.
- `pub` joins the frontmatter table in the config reference, in both languages, and `.dek/schema.json`, which `dekc sync` writes.
- A dek older than this one reads a script with `pub:` as having an unknown key, and DEK008 warns about it; nothing fails.
