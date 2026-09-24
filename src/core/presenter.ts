import type { DekConfig } from "./config.ts";
import type { PresenterSlide } from "./presenter-state.ts";
import type { ProjectDeck } from "./resolve.ts";
import { formatSectionScript, sectionTiming } from "./timing.ts";

export {
  nextPresenterTitle,
  type PresenterBeat,
  type PresenterSlide,
  type PresenterState,
  presenterState,
} from "./presenter-state.ts";

export function presenterSlides(deck: ProjectDeck, config: DekConfig): PresenterSlide[] {
  const timing = sectionTiming(deck.deck.sections, deck.deck.duration, config);
  const budgetBySlug = new Map(timing.map((row) => [row.slug, row.budgetSeconds]));
  return deck.deck.sections.map((section) => ({
    slug: section.slug,
    title: section.title,
    script: reflowScript(formatSectionScript(section)),
    beats: section.beats.map((beat) => ({ id: beat.id, title: beat.title })),
    ...(budgetBySlug.get(section.slug) !== undefined
      ? { budgetSeconds: budgetBySlug.get(section.slug) }
      : {}),
  }));
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
