import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import {
  type AnnotationRow,
  type AnnotationStatus,
  reanchor,
  type TargetRow,
} from "./annotation-rows.ts";
import { deckPaths } from "./deck-paths.ts";
import { DekError } from "./error.ts";
import { deckSlides, type WrittenElement, writtenElements } from "./html.ts";
import { type ProjectDeck, readDeckFile } from "./resolve.ts";
import { readSourceIfExists, writeInside } from "./safe-fs.ts";
import { resolveStop } from "./step.ts";
import { formatZodIssues } from "./zod.ts";

const Box = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
});
const Point = z.object({ x: z.number().finite(), y: z.number().finite() });

/**
 * One element a note is about. `was` is its text as the file wrote it when the note was written;
 * `source`, `name`, and `text` are where and what it was last found as, so a note follows its
 * element through one edit after another.
 */
const Target = z.object({
  source: z.string(),
  name: z.string(),
  was: z.string(),
  text: z.string(),
  box: Box,
  point: Point.optional(),
});

/** The slide's own files, each by a hash of what it held when the note was written. */
const SLIDE_FILES = [".html", ".css", ".ts"] as const;

/**
 * A note as it is kept: what the human wrote on which elements of a slide at which beat, and the
 * slide's own files as they were then, so a reader can tell an edited slide from one untouched.
 */
const Annotation = z.object({
  id: z.string().min(1),
  slug: z.string(),
  step: z.string(),
  text: z.string(),
  createdAt: z.string(),
  files: z.record(z.string(), z.string()),
  targets: z.array(Target).min(1),
});

export type Annotation = z.infer<typeof Annotation>;

/** Every deck's notes, by deck name, in one file of the project's. */
const AnnotationsFile = z.object({
  version: z.literal(1),
  decks: z.record(z.string(), z.array(Annotation)),
});

type AnnotationsFile = z.infer<typeof AnnotationsFile>;

/**
 * What the page asks of the notes: add one on elements of the slide, given by where each start
 * tag is written; change one's words; remove one; clear the deck's; or put back what a clear took.
 */
export const AnnotationOp = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add"),
    slug: z.string(),
    step: z.string(),
    text: z.string(),
    targets: z.array(z.object({ source: z.string(), box: Box, point: Point.optional() })).min(1),
  }),
  z.object({ op: z.literal("edit"), id: z.string(), text: z.string() }),
  z.object({ op: z.literal("remove"), id: z.string() }),
  z.object({ op: z.literal("clear") }),
  z.object({ op: z.literal("restore"), annotations: z.array(Annotation) }),
]);

export type AnnotationOp = z.infer<typeof AnnotationOp>;

/** Where the notes are kept: beside the marks, out of every deck. */
export function annotationsPath(root: string): string {
  return join(root, ".dek", "annotations.json");
}

/**
 * Do what the page asks, and answer with the deck's notes as they stand now; a clear also hands
 * back what it took, to put back. Input that names nothing on the slide as it is now, as a page
 * opened before an edit can send, is refused and changes nothing.
 */
export function applyAnnotationOp(
  root: string,
  deck: ProjectDeck,
  op: AnnotationOp,
  now: Date = new Date(),
): { annotations: AnnotationRow[]; removed?: Annotation[] } {
  const file = readAnnotationsFile(root);
  const notes = file.decks[deck.name] ?? [];
  const known = (id: string): Annotation => {
    const found = notes.find((note) => note.id === id);
    if (!found) {
      throw new DekError(`no note ${id} on deck "${deck.name}"`, {
        hint: "reload the page: the notes changed since it read them",
      });
    }
    return found;
  };
  let next: Annotation[];
  let removed: Annotation[] | undefined;
  switch (op.op) {
    case "add":
      next = [...notes, newAnnotation(deck, op, now)];
      break;
    case "edit": {
      const target = known(op.id);
      next = notes.map((note) => (note === target ? { ...note, text: op.text } : note));
      break;
    }
    case "remove": {
      const target = known(op.id);
      next = notes.filter((note) => note !== target);
      break;
    }
    case "clear":
      next = [];
      removed = notes;
      break;
    case "restore": {
      const ids = new Set(notes.map((note) => note.id));
      next = [...notes, ...op.annotations.filter((note) => !ids.has(note.id))];
      break;
    }
  }
  writeAnnotationsFile(root, deck.name, next, file);
  return { annotations: listAnnotations(root, deck), ...(removed ? { removed } : {}) };
}

/**
 * The deck's notes in talk order, each element where the file has it now. Where each was found
 * is kept for the next reader, so a note follows its element through edit after edit.
 */
export function listAnnotations(root: string, deck: ProjectDeck): AnnotationRow[] {
  const file = readAnnotationsFile(root);
  const notes = file.decks[deck.name] ?? [];
  const slides = deckSlides(deck);
  const present = new Map<string, WrittenElement[] | undefined>();
  const elementsOf = (slug: string): WrittenElement[] | undefined => {
    if (!present.has(slug)) {
      const inScript = deck.deck.sections.some((section) => section.slug === slug);
      present.set(slug, inScript ? writtenElements(slides, slug) : undefined);
    }
    return present.get(slug);
  };
  const followed = notes.map((note) => follow(note, elementsOf(note.slug)));
  const moved = followed.some(({ note }, index) => note !== notes[index]);
  if (moved) {
    writeAnnotationsFile(
      root,
      deck.name,
      followed.map(({ note }) => note),
      file,
    );
  }
  return order(deck, followed).map(({ note, found }, index) => toRow(deck, note, found, index + 1));
}

/** Drop the deck's notes, the other decks' kept; how many there were. */
export function clearAnnotations(root: string, deck: ProjectDeck): number {
  const file = readAnnotationsFile(root);
  const count = file.decks[deck.name]?.length ?? 0;
  if (count > 0) {
    writeAnnotationsFile(root, deck.name, [], file);
  }
  return count;
}

type AddOp = Extract<AnnotationOp, { op: "add" }>;

/** A note as the slide's files have it now, refused when they do not have what it names. */
function newAnnotation(deck: ProjectDeck, op: AddOp, now: Date): Annotation {
  const section = deck.deck.sections.find((entry) => entry.slug === op.slug);
  if (!section) {
    throw new DekError(`no slide "${op.slug}" in deck "${deck.name}"`, {
      hint: "reload the page: the script changed since it opened",
    });
  }
  if (resolveStop(section.beats, op.step) === undefined) {
    throw new DekError(`no beat "${op.step}" on slide "${op.slug}"`, {
      hint: "reload the page: the script changed since it opened",
    });
  }
  const elements = writtenElements(deckSlides(deck), op.slug) ?? [];
  const targets = op.targets.map((target) => {
    const element = elements.find((el) => el.source === target.source);
    if (!element) {
      throw new DekError(`slides/${op.slug}.html has no element at ${target.source}`, {
        hint: "pick it again: the slide changed since the page drew it",
      });
    }
    return {
      source: element.source,
      name: element.name,
      was: element.text,
      text: element.text,
      box: target.box,
      ...(target.point ? { point: target.point } : {}),
    };
  });
  return {
    id: crypto.randomUUID(),
    slug: op.slug,
    step: op.step,
    text: op.text,
    createdAt: now.toISOString(),
    files: slideFileHashes(deck, op.slug),
    targets,
  };
}

/** A note matched again to the slide as it is now, and which of its elements were found. */
type Followed = { note: Annotation; found: boolean[] };

function follow(note: Annotation, present: WrittenElement[] | undefined): Followed {
  const matches = note.targets.map((target) => (present ? reanchor(target, present) : undefined));
  const changed = note.targets.some((target, index) => {
    const match = matches[index];
    return (
      match !== undefined &&
      (match.source !== target.source || match.name !== target.name || match.text !== target.text)
    );
  });
  return {
    note: changed
      ? {
          ...note,
          targets: note.targets.map((target, index) => {
            const match = matches[index];
            return match
              ? { ...target, source: match.source, name: match.name, text: match.text }
              : target;
          }),
        }
      : note,
    found: matches.map((match) => match !== undefined),
  };
}

/** By slide and beat in talk order, then as they were written; past the deck, at the end. */
function order(deck: ProjectDeck, followed: Followed[]): Followed[] {
  const { sections } = deck.deck;
  const rank = ({ note }: Followed): [number, number] => {
    const slide = sections.findIndex((section) => section.slug === note.slug);
    const stop = slide < 0 ? undefined : resolveStop(sections[slide]?.beats ?? [], note.step);
    return [slide < 0 ? sections.length : slide, stop ?? Number.MAX_SAFE_INTEGER];
  };
  return followed
    .map((entry, index) => ({ entry, index, rank: rank(entry) }))
    .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.index - b.index)
    .map(({ entry }) => entry);
}

function toRow(
  deck: ProjectDeck,
  note: Annotation,
  found: boolean[],
  number: number,
): AnnotationRow {
  const paths = deckPaths(deck.dir);
  const html = paths.slide(note.slug, ".html");
  const targets: TargetRow[] = note.targets.map((target, index) => {
    const [line = 0, column = 0] = target.source.split(":").map(Number);
    const isFound = found[index] === true;
    return {
      path: html,
      line,
      column,
      found: isFound,
      name: target.name,
      was: target.was,
      text: isFound ? target.text : null,
      box: target.box,
      ...(target.point ? { point: target.point } : {}),
    };
  });
  const now = slideFileHashes(deck, note.slug);
  const changed = SLIDE_FILES.filter((ext) => now[ext] !== note.files[ext]).map((ext) =>
    paths.slide(note.slug, ext),
  );
  const status: AnnotationStatus = !found.some(Boolean)
    ? "gone"
    : changed.length > 0
      ? "edited"
      : "open";
  return {
    number,
    id: note.id,
    slug: note.slug,
    step: note.step,
    status,
    text: note.text,
    targets,
    changed,
    shot: `dekc shot ${deck.name} ${note.slug} --step ${note.step}`,
    createdAt: note.createdAt,
  };
}

/** A hash of each of the slide's own files there is, by its extension. */
function slideFileHashes(deck: ProjectDeck, slug: string): Record<string, string> {
  const paths = deckPaths(deck.dir);
  return Object.fromEntries(
    SLIDE_FILES.flatMap((ext) => {
      const text = readDeckFile(deck.dir, paths.slide(slug, ext));
      return text === undefined
        ? []
        : [[ext, createHash("sha256").update(text).digest("hex").slice(0, 16)]];
    }),
  );
}

function readAnnotationsFile(root: string): AnnotationsFile {
  const path = annotationsPath(root);
  const text = readSourceIfExists(path, root);
  if (text === undefined) {
    return { version: 1, decks: {} };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw unreadable(path, error instanceof Error ? error.message : String(error));
  }
  const parsed = AnnotationsFile.safeParse(value);
  if (!parsed.success) {
    throw unreadable(path, formatZodIssues(parsed.error));
  }
  return parsed.data;
}

function unreadable(path: string, why: string): DekError {
  return new DekError(`.dek/annotations.json does not read: ${why}`, {
    path,
    hint: "delete .dek/annotations.json to start over; every deck's notes go with it",
  });
}

function writeAnnotationsFile(
  root: string,
  deck: string,
  notes: Annotation[],
  file: AnnotationsFile,
): void {
  const { [deck]: _old, ...others } = file.decks;
  const decks = notes.length > 0 ? { ...others, [deck]: notes } : others;
  writeInside(annotationsPath(root), `${JSON.stringify({ version: 1, decks }, null, 2)}\n`, root);
}
