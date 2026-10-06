// What annotate mode keeps and hands over: notes on elements of a slide, each a snapshot of what
// the page showed when it was written, and the Markdown an agent is given to act on them. No DOM
// here, so all of it is decided by these functions alone.

import { type BeatRef, resolveStop } from "../core/step.ts";

/** A box on the slide, in logical pixels. */
export type Box = { x: number; y: number; width: number; height: number };

/** One element a note is about, as the page showed it when the note was written. */
export type NoteTarget = {
  /** `<line>:<column>` of its start tag in `slides/<slug>.html`. */
  source: string;
  /** Its tag and its own classes, as `div.chevron`. */
  name: string;
  /** Its text, whitespace collapsed and cut short; empty for a shape. */
  text: string;
  box: Box;
  /** Where the slide itself was clicked, when the note is about a place rather than an element. */
  point?: { x: number; y: number };
};

/** One note, on one slide at one beat. */
export type Note = {
  slug: string;
  /** The stop as `dekc shot --step` takes it: `0` as the slide arrives, else the beat. */
  step: string;
  targets: NoteTarget[];
  /** What the human wrote; it may be empty, when the words go in the chat. */
  text: string;
  /** Written before an edit that took its element away, so its line is as it was then. */
  stale?: true;
};

/** A slide as the page lists it. */
export type SlideInfo = { slug: string; title: string; beats: BeatRef[] };

/**
 * The notes in the order they are handed over: by slide and beat in talk order, then as they
 * were written. Markers on the page are numbered in this order too.
 */
export function sortNotes<T extends Note>(slides: readonly SlideInfo[], notes: readonly T[]): T[] {
  const order = (slug: string): number => slides.findIndex((slide) => slide.slug === slug);
  const stop = (note: Note): number =>
    resolveStop(slides[order(note.slug)]?.beats ?? [], note.step) ?? Number.MAX_SAFE_INTEGER;
  return notes
    .map((note, index) => ({ note, index }))
    .sort(
      (a, b) =>
        order(a.note.slug) - order(b.note.slug) || stop(a.note) - stop(b.note) || a.index - b.index,
    )
    .map(({ note }) => note);
}

/**
 * The notes as one Markdown block for an agent: grouped by slide and beat in talk order, each
 * element with the file and line it is written at, and how to see the slide at that beat.
 */
export function formatNotes(
  deck: string,
  slides: readonly SlideInfo[],
  notes: readonly Note[],
): string {
  if (notes.length === 0) {
    return "";
  }
  const groups = new Map<string, Note[]>();
  for (const note of sortNotes(slides, notes)) {
    const key = `${note.slug}\n${note.step}`;
    groups.set(key, [...(groups.get(key) ?? []), note]);
  }

  const lines = [
    `## Notes on decks/${deck}`,
    "",
    "Boxes and points are in the slide's own pixels, from its top left.",
  ];
  let number = 0;
  for (const group of groups.values()) {
    const first = group[0];
    if (!first) {
      continue;
    }
    const index = slides.findIndex((slide) => slide.slug === first.slug);
    const title = slides[index]?.title;
    lines.push(
      "",
      `### Slide ${index + 1} of ${slides.length}, ${first.slug}${title ? ` (${JSON.stringify(title)})` : ""}, ${beatLabel(first.step)}`,
    );
    for (const note of group) {
      number++;
      const where = (target: NoteTarget): string =>
        `${describe(target)} at decks/${deck}/slides/${note.slug}.html:${target.source} (${measure(target)})${note.stale ? ", as written before an edit; the line may have moved" : ""}`;
      lines.push("");
      if (note.targets.length === 1 && note.targets[0]) {
        lines.push(`${number}. ${where(note.targets[0])}`);
      } else {
        lines.push(`${number}. ${note.targets.length} elements:`);
        lines.push(...note.targets.map((target) => `   - ${where(target)}`));
      }
      if (note.text.trim() !== "") {
        lines.push(
          ...note.text
            .trim()
            .split(/\r?\n/)
            .map((line) => `   > ${line}`.trimEnd()),
        );
      }
    }
    lines.push("", `To see it: \`dekc shot ${deck} ${first.slug} --step ${first.step}\``);
  }
  return `${lines.join("\n")}\n`;
}

function beatLabel(step: string): string {
  if (step === "0") {
    return "as it arrives";
  }
  return /^\d+$/.test(step) ? `at beat ${step}` : `at beat \`${step}\``;
}

function describe(target: NoteTarget): string {
  return target.text === "" ? target.name : `${target.name} ${JSON.stringify(target.text)}`;
}

function measure(target: NoteTarget): string {
  if (target.point) {
    return `point ${target.point.x},${target.point.y}`;
  }
  const { x, y, width, height } = target.box;
  return `box ${x},${y} ${width}×${height}`;
}

/** An element on the slide as it is now, to match a note's target against. */
type Present = { source: string; name: string; text: string };

/**
 * The element a note's target is now, after an edit replaced its slide: the one at the same
 * place with the same name and text; else the only one with that name and text, wherever it
 * moved; else the one at the same place with the same name, whose text was rewritten, as an
 * agent does when it acts on the note. None when it cannot be told.
 */
export function reanchor<T extends Present>(
  target: NoteTarget,
  present: readonly T[],
): T | undefined {
  const same = present.find(
    (el) => el.source === target.source && el.name === target.name && el.text === target.text,
  );
  if (same) {
    return same;
  }
  const moved = present.filter((el) => el.name === target.name && el.text === target.text);
  if (moved.length === 1) {
    return moved[0];
  }
  return present.find((el) => el.source === target.source && el.name === target.name);
}

/** The notes kept in storage, or none when what is there is not notes. */
export function readNotes(raw: string | null): Note[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw ?? "");
  } catch {
    return [];
  }
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.notes)) {
    return [];
  }
  return parsed.notes.filter(isNote);
}

/** The notes as storage keeps them. */
export function writeNotes(notes: readonly Note[]): string {
  return JSON.stringify({ version: 1, notes });
}

function isNote(value: unknown): value is Note {
  return (
    isRecord(value) &&
    typeof value.slug === "string" &&
    typeof value.step === "string" &&
    typeof value.text === "string" &&
    (value.stale === undefined || value.stale === true) &&
    Array.isArray(value.targets) &&
    value.targets.length > 0 &&
    value.targets.every(isTarget)
  );
}

function isTarget(value: unknown): value is NoteTarget {
  return (
    isRecord(value) &&
    typeof value.source === "string" &&
    typeof value.name === "string" &&
    typeof value.text === "string" &&
    isRecord(value.box) &&
    [value.box.x, value.box.y, value.box.width, value.box.height].every(Number.isFinite) &&
    (value.point === undefined ||
      (isRecord(value.point) && Number.isFinite(value.point.x) && Number.isFinite(value.point.y)))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
