# 5. Annotate slide elements on the dev page and hand the notes over as text

Date: 2026-10-06

## Status

Superseded

Superseded by [7. Keep annotations in .dek/ and let agents list them with dekc annotations](0007-keep-annotations-in-dek-and-let-agents-list-them-with-dekc-annotations.md)

## Context

A slide such as a schedule drawn with chevrons and arrows has many shapes that look alike and carry no text: eight pink arrows, three chevrons in a lane. Telling an agent which one to change in words fails, and `dekc current` names only the slide. What the human wants is to point at the shape on the page and write the instruction next to it.

Tools exist for this in web apps. [agentation](https://www.agentation.com) is the closest: click an element, write a note, copy Markdown that names it. It cannot simply be installed into a dek project:

- the dev page is rendered whole by dek and has no place for a script of the user's;
- it is a React component (`react` and `react-dom` 18 or later as peer dependencies), and a dek page is not a React app;
- it is licensed under PolyForm Shield, not an open source license, so dek cannot bundle it or port its code;
- it names an element by a CSS selector of the live DOM, which for eight identical arrows is eight identical selectors, and which runs through dek's own page around the slide.

dek can do better than a selector, because it already knows where each start tag of a slide is written: the lint scan finds them with a marker in front of each tag (`src/core/html-scan.ts`).

## Decision

**The dev page says where each element is written.** Every start tag of a written slide carries `data-dek-source="<line>:<column>"`, its place in `slides/<slug>.html`, counted as diagnostics count (1-based, columns in UTF-16 units). A tag written with a `class` also carries `data-dek-class`, those classes as written. The player and a slide's own script add classes as the deck moves, such as `is-current`, and a name built from those would be in no file to search for. `stampSlide` adds both, so the page and the slide the dev server sends on a live update both carry it. Only the dev server's pages do: a build, a video, a PDF, and a still page for `shot` or lint never do. A slide still drawn from the skeleton has no file and no attributes.

**Annotate mode is a dev-only script.** It is compiled apart from the player and embedded only on the speaker's dev pages, those that carry the notes: the presenter view, and the player when the server is not on the LAN. Every built file carries the player, so the player does not grow for it. `a` turns the mode on and off, as does a button in the presenter view's bar beside the mark button, and the dev server's start banner lists the key. Nothing of the mode shows while it is off: the dev page may be the one on the projector.

**Picking.** While the mode is on, a layer over the stage takes the pointer, so a click annotates and never moves the deck.

- Hovering outlines the element under the pointer and labels it with its name and line.
- A click picks it. Cmd or Ctrl and a click adds an element to the pick, or takes it out.
- The popup lists every element under the click and near it, each before anything it is inside, each with its name and line. The user picks the level there, such as the text or the chevron around it. There are no hidden keys for this.
- The popup opens beside what was picked, under it unless there is no room, so it never hides what the human points at. While Cmd or Ctrl is held, it lets clicks through to what it lies over.
- A click where only the slide itself is under the pointer picks the slide, at that point.
- Elements answer even under `pointer-events: none`, which decorative arrows often have. Only stamped elements in the deck are given back the pointer, never the rail's copies, which carry the attribute too.
- Elements at `opacity: 0`, such as a step not yet shown, do not answer.
- A ring of points around the pointer is tried as well, so a thin line can be hit. A line found beside the pointer comes before the drawing it is in, which is under the pointer and easy to hit anyway.
- Only stamped elements on the stage are candidates. An element a slide script made answers through its nearest stamped ancestor. The rail's thumbnails and the next-slide preview are never candidates.

**A note is a snapshot.** Adding a note records:

- the slide's slug;
- the beat, as the stop `dekc shot --step` takes;
- for each element, its source, its name (the tag and its classes as `data-dek-class` has them), its text cut short, and its box on the slide in logical pixels.

The notes are kept in `sessionStorage` for the deck, so a reload does not lose them. When a live update replaces a slide, each of its notes is matched again to an element now on the slide. The rules are tried in order:

1. the same source, name, and text;
2. the same name and text, by a unique element on the slide;
3. the same source and name, when only the text changed, as it does when an agent rewrites the very element the note was about.

A match takes the element's line as it is now. Without one, the note stays as written before the edit.

**Copy hands the notes over as text.** One Markdown block, with English labels and the notes in the user's own words, grouped by slide. Each element is a full `decks/<deck>/slides/<slug>.html:<line>:<column>` reference. Each slide ends with the `dekc shot <deck> <slug> --step <stop>` that shows it at that beat. Where the Clipboard API is missing, as on a LAN page served over plain HTTP, the text is shown selected, to copy by hand. Nothing is written to disk. No command reads the notes, and no `--json` shape changes.

**Only facts.** Every field is something the page measured or the source says. Guesses that could mislead an agent are left out: which boxes an arrow connects, computed styles, and levels of detail. Text selection and area dragging are left out too: a click and Cmd-click cover what a slide needs.

agentation's ideas are reused and none of its code: picking with a visible outline, a note per pick, numbered markers, and one block to paste.

## Consequences

An agent gets an exact place for a shape that has no name, in a form it can open, and a command to see it at the beat the human saw.

`data-dek-source`, `data-dek-class`, and the `a` key are dek's from now on. The dev page's slides are larger by one or two attributes per tag, which no other page has.

Notes live in one browser tab until copied, and an agent cannot list them. If one should, a later decision can keep them in `.dek/` and add a command, as `dekc marks` does for beats. A shot of a slide with the picked elements outlined and numbered, `dekc shot --highlight`, would let the agent check it read the reference right. It adds a flag, so it is left to a decision of its own.

An element a slide script creates cannot be pointed at except through its ancestors. Diagrams meant to be annotated are written in HTML or SVG.
