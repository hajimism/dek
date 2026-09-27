import { escapeHtml } from "./escape.ts";
import type { Deck, Section } from "./schema.ts";
import { beatStep } from "./step.ts";

// The slide HTML `dek sync` writes for a section nobody has written yet. Rendering, lint, and
// `dek mv` read it too, so it lives apart from the writes in sync.ts.

/**
 * A heading that is only an id (`## intro`) has no display text. The first
 * section takes the deck title; later ones stay empty so the slug never ends
 * up on a published slide. Lint reports the empty heading (DEK024) with the
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

/** The HTML `dek sync` would generate for `slug`, or undefined when the deck has no such section. */
export function skeletonHtml(deck: Deck, slug: string): string | undefined {
  const index = deck.sections.findIndex((section) => section.slug === slug);
  return index < 0 ? undefined : sectionSkeleton(deck, index);
}

/** The skeleton of the section at `index`, which must exist. */
export function sectionSkeleton(deck: Deck, index: number): string {
  const section = deck.sections[index];
  if (!section) {
    throw new RangeError(`no section at ${index}`);
  }
  const heading = skeletonHeading(section, index, deck.title);
  const inner =
    section.beats.length === 0 ? renderTitleSlide(heading) : renderBeatSlide(section, heading);
  return `${inner}\n`;
}

/**
 * Whether `html` is still exactly what a skeleton renderer wrote, for some heading and beats. The
 * patterns mirror the renderers below byte for byte, so any edit by the author makes it false.
 */
export function isSkeleton(html: string): boolean {
  return TITLE_SKELETON.test(html) || BEAT_SKELETON.test(html);
}

const TITLE_SKELETON =
  /^<section class="slide" data-layout="title">\n {2}<h2 class="slide-title">[^<]*<\/h2>\n<\/section>\n$/;
const BEAT_SKELETON =
  /^<section class="slide" data-layout="default">\n {2}<h2 class="slide-title">[^<]*<\/h2>\n {2}<ul>\n(?: {4}<li data-step="[^"<]*">[^<]*<\/li>\n)+ {2}<\/ul>\n<\/section>\n$/;

function renderTitleSlide(heading: string): string {
  return `<section class="slide" data-layout="title">
  <h2 class="slide-title">${escapeHtml(heading)}</h2>
</section>`;
}

function renderBeatSlide(section: Section, heading: string): string {
  const items = section.beats
    .map(
      (beat, index) =>
        `    <li data-step="${beatStep(section.beats, index)}">${escapeHtml(beat.title)}</li>`,
    )
    .join("\n");
  return `<section class="slide" data-layout="default">
  <h2 class="slide-title">${escapeHtml(heading)}</h2>
  <ul>
${items}
  </ul>
</section>`;
}
