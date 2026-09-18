import type { Position } from "./step.ts";

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
