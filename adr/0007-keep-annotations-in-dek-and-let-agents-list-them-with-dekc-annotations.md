# 7. Keep annotations in .dek/ and let agents list them with dekc annotations

Date: 2026-10-06

## Status

Accepted

Supersedes [5. Annotate slide elements on the dev page and hand the notes over as text](0005-annotate-slide-elements-on-the-dev-page-and-hand-the-notes-over-as-text.md)

## Context

ADR 5 put annotate mode's notes in the browser tab's `sessionStorage` and handed them over only by Copy: "No command reads the notes, and no `--json` shape changes." An agent learned of them only when the human copied and pasted, and could not tell afterwards which notes its edits had reached. It named the next step: keep the notes in `.dek/` and add a command, as `dekc marks` does for beats.

open-slide closes the same loop by writing comments into the source and removing them as a skill applies them; dek's sources hold only the script and the slides, so that is not open to it. agentation hands notes over by MCP as well as Copy; dek's interface for agents is its CLI.

Three things made the tab a poor home once a command reads the notes:

- Two homes disagree. The page matched each note again on every live update and wrote the new line and text over the old. A command computing a note's state from the file would find it already rewritten to match, and call an edited element untouched.
- An agent edits with no browser open. Whatever matches a note to the file must run where the file is, on read.
- A note written on the laptop was invisible on the phone driving the presenter view, and lost with the tab.

## Decision

**The dev server keeps the notes, in `.dek/annotations.json`.** One file for the project, every deck's notes by its name, beside `.dek/marks.json`; `dekc sync` adds it to `.gitignore` as it does the marks. It is the only copy: the page holds none of its own. The page asks for the notes when it opens, after every live update, and when the server says they changed, and sends each change as one operation (`add`, `edit`, `remove`, `clear`, `restore`) to `/annotations`, a presenter route like `/marks`. After each change the server sends an `annotations` event to the deck's presenter pages, so every tab and device annotating the deck shows the same notes. A refusal, such as a note on an element a save has moved since the page drew it, is said above the bar, and the page asks again.

**The file says what an element is, not the page.** A note sends only where each picked start tag is written, its box, and a point for the slide itself. The server reads the element's name, its tag and classes as written, and its text as written, from the file, with the same pass that stamps `data-dek-source`, so a note's names and the page's stamps agree by construction. A note on a slide, a beat, or an element the file does not have is refused and changes nothing.

**A note is a snapshot; matching happens on read.** The note keeps its element's text as written when it was written (`was`), and a hash of each of the slide's own files, `slides/<slug>.html`, `.css`, and `.ts`, as they were. Each read matches every element again to the file as it is now, by ADR 5's three rules in order: the same place, name, and text; the same name and text, by a unique element; the same place and name, when only the text changed. A fourth follows them: the same place and tag, when the classes changed. An agent restyles the very element a note names by changing its class, and without the rule that note would read as gone the moment it was dealt with. Where each element was found, with its name and text there, is written back, so a note follows its element through one edit after another; `was`, its text when the note was written, and the hashes are never rewritten.

**`dekc annotations [deck]` lists them; `dekc annotations [deck] clear` drops them.** The name is not "notes", which in dek are the speaker's script, and it sits beside `dekc marks`: marks are beats of the script, annotations are elements of the slides. It reads the file, so no dev server needs to be running; scope and errors are those of every deck command. Each note has, as fields:

- `number`, as the page's markers and Copy number it, in talk order; `id`;
- `slug`, `step`, and `shot`, the `dekc shot <deck> <slug> --step <step>` that shows the slide at the beat the human saw;
- `text`, the human's words;
- `targets`, for each element: `path`, `line`, and `column` of its start tag now, or where it was last found; `found`; `name`, as written where it was last found; `was` and `text`, its text then and now; `box`, on the slide when noted; `point` for the slide itself;
- `status`, aligned with marks: `open` while the slide's own files are as they were, `edited` once one changed, with `changed` naming them, and `gone` once none of the note's elements is on the slide or the slide left the script;
- `createdAt`.

`edited` is a fact about the files, not a verdict on the note: a fix may be in the slide's CSS rather than its markup, which no element-level check could see, so any change to the slide's own files counts, and nothing outside them does. A change to `theme.css` reaches every slide and would mark every note `edited`, so it is left out; a note dealt with there stays `open`, and the agent checks the shot. An element an edit took away, or changed past matching, keeps the place it was last found, as ADR 5 kept a note it could not follow.

**The human clears.** An agent lists notes, fixes, and lists again to see `edited`; whether the slide now does what the note asked is the human's call, as whether rewritten words say well is the speaker's for marks. The generated `AGENTS.md` says so, and lists the command; so does `dekc help --agent`. The page's Clear, and its Undo until the next note, are kept, now as operations on the file.

**Copy stays.** An agent that cannot reach the project, on another machine or in a web chat, gets the same facts as one Markdown block, now written from the server's rows, so it names each element where the file has it now.

**What ADR 5 decided otherwise stands:** the `data-dek-source` and `data-dek-class` stamps on the dev page only; annotate mode as a dev-only script on the speaker's pages; picking; the snapshot's fields; "only facts". Built files, videos, PDFs, and the still pages of `shot` and lint carry nothing of the notes.

## Consequences

"Deal with my notes" is enough: the agent lists them, edits the files, and lists them again to see which slides it changed, without the human copying anything. Notes last through reloads and restarts, and across tabs and devices.

The page cannot keep a note without the dev server, which it never could have without being served by it. `.dek/annotations.json` is one more file dek keeps for itself, with a shape of its own; it is local state, not a format, and dek may change it. `edited` is coarser than one note: a fix to one note on a slide marks the slide's other notes `edited` too, and only the shot tells them apart. A change to `theme.css` leaves every note `open`.

`dekc shot --highlight`, a shot with the picked elements outlined, is still left to a decision of its own.
