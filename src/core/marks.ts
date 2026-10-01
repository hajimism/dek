import { join } from "node:path";
import { z } from "zod";
import { DekcError } from "./error.ts";
import type { ProjectDeck } from "./resolve.ts";
import { readSourceIfExists, writeInside } from "./safe-fs.ts";
import type { Section } from "./schema.ts";
import type { Position } from "./step.ts";
import { formatZodIssues } from "./zod.ts";

/**
 * A mark the speaker left on a beat while rehearsing: these words want rewriting. It names its
 * beat by the section's slug and the beat's id, or its title when it has none, never by index,
 * so it stays on its beat while beats are added before it. It keeps the words as they were when
 * marked, so a reader can tell a beat already rewritten from one still waiting.
 */
const Mark = z.object({
  slug: z.string(),
  /** The beat's title; null for what the slide says as it arrives, before its first `###`. */
  beat: z.string().nullable(),
  id: z.string().optional(),
  was: z.string(),
  markedAt: z.string(),
});

type Mark = z.infer<typeof Mark>;

/** Every deck's marks, by deck name, in one file of the project's. */
const MarksFile = z.object({ version: z.literal(1), decks: z.record(z.string(), z.array(Mark)) });

type MarksFile = z.infer<typeof MarksFile>;

/** Where the marks are kept: beside the dev server's lock, out of every deck. */
export function marksPath(root: string): string {
  return join(root, ".dekc", "marks.json");
}

/**
 * A mark as the script has it now: where its beat is and what it says, or `gone` when no beat by
 * its name is left. `edited` once the words differ from what was marked.
 */
export type MarkRow = {
  slug: string;
  beat: string | null;
  beatIndex: number | null;
  line: number | null;
  path: string;
  status: "open" | "edited" | "gone";
  was: string;
  text: string | null;
  markedAt: string;
};

/** Mark the beat at `position`, or unmark it when it is marked; the deck's marks after. */
export function toggleMark(
  root: string,
  deck: ProjectDeck,
  position: Position,
  now: Date = new Date(),
): { marked: boolean; positions: Position[] } {
  const beat = beatAt(deck.deck.sections, position);
  if (!beat) {
    throw new DekcError(
      `no beat ${position.beatIndex} on slide ${position.slideIndex + 1} of deck "${deck.name}"`,
      { hint: "reload the presenter view: the script changed since it opened" },
    );
  }
  const file = readMarksFile(root);
  const marks = file.decks[deck.name] ?? [];
  const at = marks.findIndex((mark) => sameBeat(mark, beat));
  const next =
    at >= 0
      ? marks.filter((_, index) => index !== at)
      : [...marks, { ...beat.anchor, was: beat.text, markedAt: now.toISOString() }];
  writeMarksFile(root, deck.name, next, file);
  return {
    marked: at < 0,
    positions: positionsOf(deck, next),
  };
}

/** The deck's marks in the order they were made, each where the script has it now. */
export function listMarks(root: string, deck: ProjectDeck): MarkRow[] {
  return (readMarksFile(root).decks[deck.name] ?? []).map((mark) => {
    const found = findBeat(deck.deck.sections, mark);
    const text = found?.text ?? null;
    return {
      slug: mark.slug,
      beat: found ? found.anchor.beat : mark.beat,
      beatIndex: found?.position.beatIndex ?? null,
      line: found?.line ?? null,
      path: deck.scriptPath,
      status: !found ? "gone" : text === mark.was ? "open" : "edited",
      was: mark.was,
      text,
      markedAt: mark.markedAt,
    };
  });
}

/** Where the deck's marked beats are now; a mark whose beat is gone is on no slide. */
export function markedPositions(root: string, deck: ProjectDeck): Position[] {
  return positionsOf(deck, readMarksFile(root).decks[deck.name] ?? []);
}

/** Drop the deck's marks, the other decks' kept; how many there were. */
export function clearMarks(root: string, deck: ProjectDeck): number {
  const file = readMarksFile(root);
  const count = file.decks[deck.name]?.length ?? 0;
  if (count > 0) {
    writeMarksFile(root, deck.name, [], file);
  }
  return count;
}

type FoundBeat = {
  position: Position;
  line: number;
  text: string;
  anchor: Pick<Mark, "slug" | "beat" | "id">;
};

function beatsOf(sections: Section[]): FoundBeat[] {
  return sections.flatMap((section, slideIndex) => [
    {
      position: { slideIndex, beatIndex: 0 },
      line: section.line,
      text: section.body,
      anchor: { slug: section.slug, beat: null },
    },
    ...section.beats.map((beat, index) => ({
      position: { slideIndex, beatIndex: index + 1 },
      line: beat.line,
      text: beat.body,
      anchor: { slug: section.slug, beat: beat.title, ...(beat.id ? { id: beat.id } : {}) },
    })),
  ]);
}

function beatAt(sections: Section[], position: Position): FoundBeat | undefined {
  return beatsOf(sections).find(
    (beat) =>
      beat.position.slideIndex === position.slideIndex &&
      beat.position.beatIndex === position.beatIndex,
  );
}

function findBeat(sections: Section[], mark: Mark): FoundBeat | undefined {
  return beatsOf(sections).find((beat) => sameBeat(mark, beat));
}

/** A beat with an id is known by it, so retitling it keeps its mark; any other, by its title. */
function sameBeat(mark: Pick<Mark, "slug" | "beat" | "id">, beat: FoundBeat): boolean {
  if (mark.slug !== beat.anchor.slug) {
    return false;
  }
  return mark.id !== undefined ? mark.id === beat.anchor.id : mark.beat === beat.anchor.beat;
}

function positionsOf(deck: ProjectDeck, marks: Mark[]): Position[] {
  return marks
    .flatMap((mark) => {
      const found = findBeat(deck.deck.sections, mark);
      return found ? [found.position] : [];
    })
    .sort((a, b) => a.slideIndex - b.slideIndex || a.beatIndex - b.beatIndex);
}

function readMarksFile(root: string): MarksFile {
  const path = marksPath(root);
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
  const parsed = MarksFile.safeParse(value);
  if (!parsed.success) {
    throw unreadable(path, formatZodIssues(parsed.error));
  }
  return parsed.data;
}

function unreadable(path: string, why: string): DekcError {
  return new DekcError(`.dekc/marks.json does not read: ${why}`, {
    path,
    hint: "delete .dekc/marks.json to start over; every deck's marks go with it",
  });
}

function writeMarksFile(root: string, deck: string, marks: Mark[], file: MarksFile): void {
  const { [deck]: _old, ...others } = file.decks;
  const decks = marks.length > 0 ? { ...others, [deck]: marks } : others;
  writeInside(marksPath(root), `${JSON.stringify({ version: 1, decks }, null, 2)}\n`, root);
}
