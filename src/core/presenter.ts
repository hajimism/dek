import type { DekConfig } from "./config.ts";
import type { PresenterSlide } from "./presenter-state.ts";
import type { ProjectDeck } from "./resolve.ts";
import { type ScriptLine, scriptLines } from "./script-lines.ts";
import { formatSectionScript, sectionTiming } from "./timing.ts";

export {
  nextPresenterTitle,
  type PresenterSlide,
  presenterState,
} from "./presenter-state.ts";

/**
 * Who reads the script the page carries: the speaker reads all of it, and a page anyone may open
 * carries only what is said aloud, since the directions and the comments were for the speaker.
 */
export type ScriptReader = "speaker" | "audience";

export function presenterSlides(
  deck: ProjectDeck,
  config: DekConfig,
  reader: ScriptReader = "speaker",
): PresenterSlide[] {
  const timing = sectionTiming(deck.deck.sections, deck.deck.duration, config);
  const budgetBySlug = new Map(timing.map((row) => [row.slug, row.budgetSeconds]));
  return deck.deck.sections.map((section) => {
    const script = formatSectionScript(section);
    return {
      slug: section.slug,
      title: section.title,
      script: reflowScript(reader === "audience" ? withoutDirections(script) : script),
      beats: section.beats.map((beat) => ({ id: beat.id, title: beat.title })),
      ...(budgetBySlug.get(section.slug) !== undefined
        ? { budgetSeconds: budgetBySlug.get(section.slug) }
        : {}),
    };
  });
}

const COMMENT_RE = /<!--[\s\S]*?(?:-->|$)/g;
const DIRECTION_RE = /^\s*>/;

/**
 * The script without what was for the speaker alone: stage directions, which are blockquotes, and
 * HTML comments. A fenced code block is text the slide shows, so a `>` or a comment in it stays.
 * The blank lines a removal leaves are folded into one, as between any two paragraphs.
 */
export function withoutDirections(script: string): string {
  const kept: ScriptLine[] = [];
  for (const run of fenceRuns(scriptLines(script))) {
    if (run[0]?.fenced) {
      kept.push(...run);
      continue;
    }
    const prose = run
      .map((line) => line.text)
      .join("\n")
      .replace(COMMENT_RE, "");
    for (const text of prose.split("\n")) {
      if (!DIRECTION_RE.test(text)) {
        kept.push({ text: text.trimEnd(), literal: false, fenced: false });
      }
    }
  }
  const out: string[] = [];
  for (const line of kept) {
    const blank = !line.fenced && line.text.trim() === "";
    if (blank && (out.length === 0 || out.at(-1) === "")) {
      continue;
    }
    out.push(line.text);
  }
  while (out.at(-1) === "") {
    out.pop();
  }
  return out.join("\n");
}

/** The lines cut into runs that are all fenced or all not, in order. */
function fenceRuns(lines: ScriptLine[]): ScriptLine[][] {
  const runs: ScriptLine[][] = [];
  for (const line of lines) {
    const run = runs.at(-1);
    if (run && run[0]?.fenced === line.fenced) {
      run.push(line);
    } else {
      runs.push([line]);
    }
  }
  return runs;
}

const FENCE_RE = /^\s*(```|~~~)/;
/** Lines that stand on their own: blank, stage direction, list item, table row, heading. */
const BLOCK_LINE_RE = /^\s*($|>|[-*+]\s|\d+\.\s|\||#)/;
const WIDE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\uff00-\uffef]/u;

/**
 * Joins the soft line breaks of each paragraph, so the presenter wraps the
 * script to its own width instead of the editor's. Japanese joins without a
 * space; everything else joins with one.
 */
export function reflowScript(script: string): string {
  const out: string[] = [];
  let inFence = false;
  let joinable = false;
  for (const raw of script.split(/\r?\n/)) {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      out.push(raw);
      joinable = false;
      continue;
    }
    if (inFence || BLOCK_LINE_RE.test(raw)) {
      out.push(raw);
      joinable = false;
      continue;
    }
    const line = raw.trim();
    const last = out.length - 1;
    const previous = out[last];
    if (joinable && previous !== undefined) {
      const wide = WIDE_RE.test([...previous].at(-1) ?? "") || WIDE_RE.test([...line][0] ?? "");
      out[last] = `${previous}${wide ? "" : " "}${line}`;
    } else {
      out.push(line);
    }
    joinable = true;
  }
  return out.join("\n");
}
