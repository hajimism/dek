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
    if (word.length < 2 || word in dict || seen.has(word)) {
      continue;
    }
    seen.add(word);
    found.push(word);
  }
  return found;
}

export function cuesFromDeck(deck: Deck, dict: VoiceDict = {}): Cue[] {
  const cues: Cue[] = [];
  for (const [slideIndex, section] of deck.sections.entries()) {
    if (section.beats.length === 0) {
      cues.push(
        cueAt(section.slug, { slideIndex, beatIndex: 0 }, section.line, section.body, dict),
      );
      continue;
    }
    for (const [beatIndex, beat] of section.beats.entries()) {
      const markdown = beatIndex === 0 ? joinBodies(section.body, beat.body) : beat.body;
      cues.push(cueAt(section.slug, { slideIndex, beatIndex }, beat.line, markdown, dict));
    }
  }
  return cues;
}

function cueAt(
  slug: string,
  position: Position,
  line: number,
  markdown: string,
  dict: VoiceDict,
): Cue {
  return {
    position,
    slug,
    line,
    paragraphs: spokenParagraphs(markdown).map((paragraph) => applyDict(paragraph, dict)),
  };
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
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1");
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

export function splitSentences(paragraph: string): string[] {
  return paragraph
    .split(SENTENCE_RE)
    .map((part) => part.trim())
    .filter(Boolean);
}
