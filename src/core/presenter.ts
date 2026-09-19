import type { DekConfig } from "./config.ts";
import type { ProjectDeck } from "./resolve.ts";
import type { Position } from "./step.ts";
import { formatSectionScript, sectionTiming } from "./timing.ts";

export type PresenterBeat = {
  id?: string;
  title: string;
};

export type PresenterSlide = {
  slug: string;
  title: string;
  script: string;
  beats: PresenterBeat[];
  budgetSeconds?: number;
};

export type PresenterState = {
  current: PresenterSlide;
  next: PresenterSlide | null;
  script: string;
  currentBeatIndex: number;
  currentBeat: PresenterBeat | null;
};

export function presenterState(slides: PresenterSlide[], pos: Position): PresenterState {
  const current = slides[pos.slideIndex];
  if (!current) {
    throw new Error(`slide index ${pos.slideIndex} out of range`);
  }
  return {
    current,
    next: slides[pos.slideIndex + 1] ?? null,
    script: current.script,
    currentBeatIndex: pos.beatIndex,
    currentBeat: current.beats[pos.beatIndex] ?? null,
  };
}

export function nextPresenterTitle(state: PresenterState): string {
  if (state.currentBeatIndex + 1 < state.current.beats.length) {
    return state.current.title;
  }
  return state.next?.title ?? "";
}

export function presenterSlides(deck: ProjectDeck, config: DekConfig): PresenterSlide[] {
  const timing = sectionTiming(deck.deck.sections, deck.deck.duration, config);
  const budgetBySlug = new Map(timing.map((row) => [row.slug, row.budgetSeconds]));
  return deck.deck.sections.map((section) => ({
    slug: section.slug,
    title: section.title,
    script: formatSectionScript(section),
    beats: section.beats.map((beat) => ({ id: beat.id, title: beat.title })),
    ...(budgetBySlug.get(section.slug) !== undefined
      ? { budgetSeconds: budgetBySlug.get(section.slug) }
      : {}),
  }));
}
