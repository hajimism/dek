// What annotate mode hands over, shared by the dev server, `dekc annotations`, and the page: a
// note on elements of a slide as the files have them now, how one is matched again after an
// edit, and the Markdown Copy writes. No DOM and no file system here, so all of it is decided by
// these functions alone.

/** A box on the slide, in logical pixels, from its top left. */
export type Box = { x: number; y: number; width: number; height: number };

/** A point on the slide, in logical pixels, from its top left. */
export type Point = { x: number; y: number };

/**
 * Whether a note still stands as written: `open` while the slide's own files are as they were
 * when it was written, `edited` once one of them changed, and `gone` once none of its elements is
 * on the slide, or the slide is gone from the script.
 */
export type AnnotationStatus = "open" | "edited" | "gone";

/** One element a note is about, where the file has it now. */
export type TargetRow = {
  /** The slide's HTML file. */
  path: string;
  /** Where its start tag is now; where it was last found, when it is not found. */
  line: number;
  column: number;
  found: boolean;
  /** Its tag and its classes as written where it was last found, as `div.chevron`. */
  name: string;
  /** Its text as written when the note was written, cut short; empty for a shape. */
  was: string;
  /** Its text as written now; null when it is not found. */
  text: string | null;
  /** Its box on the slide when the note was written. */
  box: Box;
  /** Where the slide itself was clicked, when the note is about a place rather than an element. */
  point?: Point;
};

/** One note as it stands now, numbered as the page's markers and Copy number it. */
export type AnnotationRow = {
  number: number;
  id: string;
  slug: string;
  /** The stop as `dekc shot --step` takes it: `0` as the slide arrives, else the beat. */
  step: string;
  status: AnnotationStatus;
  /** What the human wrote; it may be empty, when the words go in the chat. */
  text: string;
  targets: TargetRow[];
  /** The slide's own files that changed since the note was written. */
  changed: string[];
  /** The command that shows the slide at the note's beat. */
  shot: string;
  createdAt: string;
};

/** How long an element's text may be before it is cut short. */
const TEXT_MAX = 40;

/** An element's text, whitespace collapsed, as a note quotes it. */
export function cutText(text: string): string {
  const squashed = text.replace(/\s+/g, " ").trim();
  return squashed.length > TEXT_MAX ? `${squashed.slice(0, TEXT_MAX)}…` : squashed;
}

/** An element as a note names it, to match a note's target against. */
type Named = { source: string; name: string; text: string };

/**
 * The element a note's target is now, after an edit: the one at the same place with the same
 * name and text; else the only one with that name and text, wherever it moved; else the one at
 * the same place with the same name, whose text was rewritten, as an agent does when it acts on
 * the note; else the one at the same place with the same tag, whose classes were changed, as an
 * agent does to restyle it. None when it cannot be told.
 */
export function reanchor<T extends Named>(target: Named, present: readonly T[]): T | undefined {
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
  const named = present.find((el) => el.source === target.source && el.name === target.name);
  if (named) {
    return named;
  }
  const tag = (name: string): string => name.split(".")[0] ?? "";
  return present.find((el) => el.source === target.source && tag(el.name) === tag(target.name));
}

/** A slide as the page lists it. */
export type SlideInfo = { slug: string; title: string };

/**
 * The notes as one Markdown block for an agent, in the order given, grouped by slide and beat:
 * each element with the file and line it is written at now, and how to see the slide at that
 * beat. Written for an agent that has no dev server to ask, so it says what `dekc annotations`
 * would.
 */
export function formatNotes(
  deck: string,
  slides: readonly SlideInfo[],
  rows: readonly AnnotationRow[],
): string {
  if (rows.length === 0) {
    return "";
  }
  const groups = new Map<string, AnnotationRow[]>();
  for (const row of rows) {
    const key = `${row.slug}\n${row.step}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const lines = [
    `## Notes on decks/${deck}`,
    "",
    "Boxes and points are in the slide's own pixels, from its top left.",
  ];
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
    for (const row of group) {
      const where = (target: TargetRow): string =>
        `${describe(target)} at decks/${deck}/slides/${row.slug}.html:${target.line}:${target.column} (${measure(target)})${target.found ? "" : ", as written before an edit; the line may have moved"}`;
      lines.push("");
      if (row.targets.length === 1 && row.targets[0]) {
        lines.push(`${row.number}. ${where(row.targets[0])}`);
      } else {
        lines.push(`${row.number}. ${row.targets.length} elements:`);
        lines.push(...row.targets.map((target) => `   - ${where(target)}`));
      }
      if (row.text.trim() !== "") {
        lines.push(
          ...row.text
            .trim()
            .split(/\r?\n/)
            .map((line) => `   > ${line}`.trimEnd()),
        );
      }
    }
    lines.push("", `To see it: \`${first.shot}\``);
  }
  return `${lines.join("\n")}\n`;
}

function beatLabel(step: string): string {
  if (step === "0") {
    return "as it arrives";
  }
  return /^\d+$/.test(step) ? `at beat ${step}` : `at beat \`${step}\``;
}

function describe(target: TargetRow): string {
  const text = target.text ?? target.was;
  return text === "" ? target.name : `${target.name} ${JSON.stringify(text)}`;
}

function measure(target: TargetRow): string {
  if (target.point) {
    return `point ${target.point.x},${target.point.y}`;
  }
  const { x, y, width, height } = target.box;
  return `box ${x},${y} ${width}×${height}`;
}
