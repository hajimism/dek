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
    script: formatSectionScript(section),
    beats: section.beats.map((beat) => ({ id: beat.id, title: beat.title })),
    ...(budgetBySlug.get(section.slug) !== undefined
      ? { budgetSeconds: budgetBySlug.get(section.slug) }
      : {}),
  }));
}
