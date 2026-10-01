import { cssLayoutNames, parseCss } from "./css.ts";
import { deckPaths } from "./deck-paths.ts";
import { escapeHtml } from "./escape.ts";
import { readDeckFile } from "./resolve.ts";
import type { Deck, Section } from "./schema.ts";
import { beatStep } from "./step.ts";

// The slide HTML `dekc sync` writes for a section nobody has written yet. Rendering, lint, and
// `dekc mv` read it too, so it lives apart from the writes in sync.ts.

/**
 * The layouts a deck's theme.css lays out. A skeleton names a layout only from these, so a new
 * deck passes lint in whatever theme it was made with.
 */
export type SkeletonLayouts = ReadonlySet<string>;

export function deckLayouts(deckDir: string): SkeletonLayouts {
  const css = readDeckFile(deckDir, deckPaths(deckDir).theme);
  return css === undefined ? new Set() : cssLayoutNames(parseCss(css));
}

/**
 * A heading that is only an id (`## intro`) has no display text. The first
 * section takes the deck title; later ones stay empty so the slug never ends
 * up on a published slide. Lint reports the empty heading (DEKC024) with the
 * fix: a title in script.md, which the next sync writes here.
 */
function skeletonHeading(
  section: Pick<Section, "slug" | "title">,
  index: number,
  deckTitle: string,
): string {
  if (section.title !== section.slug) {
    return section.title;
  }
  return index === 0 ? deckTitle : "";
}

/** The HTML `dekc sync` would generate for `slug`, or undefined when the deck has no such section. */
export function skeletonHtml(
  deck: Deck,
  slug: string,
  layouts: SkeletonLayouts,
): string | undefined {
  const index = deck.sections.findIndex((section) => section.slug === slug);
  return index < 0 ? undefined : sectionSkeleton(deck, index, layouts);
}

/** The skeleton of the section at `index`, which must exist. */
export function sectionSkeleton(deck: Deck, index: number, layouts: SkeletonLayouts): string {
  const section = deck.sections[index];
  if (!section) {
    throw new RangeError(`no section at ${index}`);
  }
  const heading = skeletonHeading(section, index, deck.title);
  const inner =
    section.beats.length === 0
      ? renderTitleSlide(heading, layouts)
      : renderBeatSlide(section, heading, layouts);
  return `${inner}\n`;
}

/** The opening tag, naming `layout` only when the theme lays it out; a bare slide is valid. */
function openSlide(layout: string, layouts: SkeletonLayouts): string {
  return layouts.has(layout)
    ? `<section class="slide" data-layout="${layout}">`
    : `<section class="slide">`;
}

function renderTitleSlide(heading: string, layouts: SkeletonLayouts): string {
  return `${openSlide("title", layouts)}
  <h2 class="slide-title">${escapeHtml(heading)}</h2>
</section>`;
}

function renderBeatSlide(section: Section, heading: string, layouts: SkeletonLayouts): string {
  const items = section.beats
    .map(
      (beat, index) =>
        `    <li data-step="${beatStep(section.beats, index)}">${escapeHtml(beat.title)}</li>`,
    )
    .join("\n");
  return `${openSlide("default", layouts)}
  <h2 class="slide-title">${escapeHtml(heading)}</h2>
  <ul>
${items}
  </ul>
</section>`;
}
