import type { Deck } from "./schema.ts";
import type { Position } from "./step.ts";

export type VoiceDict = Record<string, { kana: string; accent?: number }>;

export type Cue = {
  position: Position;
  slug: string;
  line: number;
  paragraphs: string[];
};

const FENCE_RE = /^\s*```/;
const BLOCKQUOTE_RE = /^\s*>/;
const LIST_RE = /^\s*(?:[-*+]|\d+\.)\s/;
const TABLE_RE = /^\s*\|/;
const ASCII_WORD_RE = /[A-Za-z][A-Za-z0-9+.#-]*/g;

export function spokenParagraphs(markdown: string): string[] {
  const paragraphs: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = (): void => {
    if (current.length === 0) {
      return;
    }
    const text = normalizeSpoken(unwrapInline(current.join("\n")));
    if (text) {
      paragraphs.push(text);
    }
    current = [];
  };

  for (const line of markdown.split(/\r?\n/)) {
    if (FENCE_RE.test(line)) {
      if (!inFence) {
        flush();
      }
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    if (
      BLOCKQUOTE_RE.test(line) ||
      LIST_RE.test(line) ||
      TABLE_RE.test(line) ||
      line.trim() === ""
    ) {
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return paragraphs;
}

export function applyDict(text: string, dict: VoiceDict): string {
  const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
  if (keys.length === 0) {
    return text;
  }
  const pattern = keys.map(dictKeyPattern).join("|");
  return text.replace(new RegExp(pattern, "g"), (match) => dict[match]?.kana ?? match);
}

export function unknownAsciiWords(text: string, dict: VoiceDict): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(ASCII_WORD_RE)) {
    const word = match[0];
    if (word.length < 2 || Object.hasOwn(dict, word) || seen.has(word)) {
      continue;
    }
    seen.add(word);
    found.push(word);
  }
  return found;
}

export type CueSource = {
  position: Position;
  slug: string;
  line: number;
  markdown: string;
};

/** One entry per cue: the markdown that feeds it. Beat 0 also carries the section body. */
function cueSources(deck: Deck): CueSource[] {
  const sources: CueSource[] = [];
  for (const [slideIndex, section] of deck.sections.entries()) {
    if (section.beats.length === 0) {
      sources.push({
        position: { slideIndex, beatIndex: 0 },
        slug: section.slug,
        line: section.line,
        markdown: section.body,
      });
      continue;
    }
    for (const [beatIndex, beat] of section.beats.entries()) {
      sources.push({
        position: { slideIndex, beatIndex },
        slug: section.slug,
        line: beat.line,
        markdown: beatIndex === 0 ? joinBodies(section.body, beat.body) : beat.body,
      });
    }
  }
  return sources;
}

export function cuesFromDeck(deck: Deck, dict: VoiceDict = {}): Cue[] {
  return cueSources(deck).map((source) => ({
    position: source.position,
    slug: source.slug,
    line: source.line,
    paragraphs: spokenParagraphs(source.markdown).map((paragraph) => applyDict(paragraph, dict)),
  }));
}

export type SilentCue = Pick<CueSource, "position" | "slug" | "line">;

/**
 * Cues that show something (list, code, table) but say nothing. An empty or
 * blockquote-only beat is a deliberate pause and is not reported.
 */
export function silentCues(deck: Deck): SilentCue[] {
  return cueSources(deck)
    .filter(
      (source) => spokenParagraphs(source.markdown).length === 0 && hasVisibleBody(source.markdown),
    )
    .map(({ position, slug, line }) => ({ position, slug, line }));
}

function hasVisibleBody(markdown: string): boolean {
  return markdown.split(/\r?\n/).some((line) => line.trim() !== "" && !BLOCKQUOTE_RE.test(line));
}

function joinBodies(a: string, b: string): string {
  return [a, b].filter((part) => part.trim()).join("\n\n");
}

function unwrapInline(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(?<![A-Za-z0-9_])\*([^*]+)\*(?![A-Za-z0-9_])/g, "$1")
    .replace(/(?<![A-Za-z0-9_])_([^_]+)_(?![A-Za-z0-9_])/g, "$1");
}

function normalizeSpoken(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function dictKeyPattern(key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/^[A-Za-z]/.test(key)) {
    return `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`;
  }
  return escaped;
}

const SENTENCE_RE = /(?<=[。！？!?．])\s*|(?<=\.)(?=\s|$)\s*|\n+/;
const ABBREV_END = /(?:^| )[A-Za-z]{1,3}\.$/;

export function splitSentences(paragraph: string): string[] {
  const parts = paragraph
    .split(SENTENCE_RE)
    .map((part) => part.trim())
    .filter(Boolean);
  const merged: string[] = [];
  for (const part of parts) {
    const prev = merged.at(-1);
    if (prev && ABBREV_END.test(prev)) {
      merged[merged.length - 1] = `${prev} ${part}`;
    } else {
      merged.push(part);
    }
  }
  return merged;
}
