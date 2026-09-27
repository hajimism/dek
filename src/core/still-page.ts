import { readTheme } from "./assets.ts";
import { playerChromeCss } from "./chrome.ts";
import { type DeckSlides, deckSlides, htmlShell, stampSlide } from "./html.ts";
import { type ProjectDeck, requireSection } from "./resolve.ts";
import { logicalSize } from "./size.ts";
import {
  loadSlideScripts,
  type SlideScriptEntry,
  stillPageScript,
  usableSlideScripts,
} from "./slide-script.ts";
import { stepKey, stepValuesForBeat } from "./step.ts";

/** What a run of still pages shares, read once instead of once per page. */
export type SlideSources = {
  deck: ProjectDeck;
  themeCss: string;
  slides: DeckSlides;
  scripts: SlideScriptEntry[];
  /** Whether a broken slide script fails its page (shots) or is skipped (visual lint). */
  strict: boolean;
};

export function loadSlideSources(
  deck: ProjectDeck,
  options: { strict?: boolean } = {},
): SlideSources {
  return {
    deck,
    themeCss: readTheme(deck.dir, false),
    slides: deckSlides(deck),
    scripts: loadSlideScripts(deck.dir),
    strict: options.strict ?? true,
  };
}

/** One slide alone on a page, held at `beatIndex`, as shots and visual lint measure it. */
export function renderSlideHtml(sources: SlideSources, slug: string, beatIndex: number): string {
  const { deck } = sources;
  const section = requireSection(deck, slug);
  const slide = stampSlide(sources.slides.section(slug), {
    slug,
    shown: stepValuesForBeat(section.beats, beatIndex),
    beat: { index: beatIndex, step: stepKey(section.beats, beatIndex) },
    inline: { deckDir: deck.dir },
  });
  const scripts = usableSlideScripts(
    sources.scripts.filter((entry) => entry.slug === slug),
    sources.strict,
  );
  return htmlShell({
    lang: deck.deck.lang,
    head: `<style>${playerChromeCss(logicalSize(deck.deck.ratio))}</style>
  <style>${sources.themeCss}</style>`,
    body: `<div id="deck">${slide}</div>
  ${stillPageScript(scripts)}`,
  });
}
