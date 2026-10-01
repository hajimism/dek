import { DekError } from "../error.ts";
import {
  askPlaywright,
  type PagesRequest,
  type PlaywrightRunner,
  requirePlaywright,
  type VisualPage,
} from "../playwright.ts";
import { asResolvedDeck, type ResolvedDeck, requireSection } from "../resolve.ts";
import { dropLinks, isCachedFile } from "../safe-fs.ts";
import type { Section } from "../schema.ts";
import { overviewSheets, SHEET_LAYOUT_VERSION, type SheetSpec } from "../sheet.ts";
import { bundleEntry, type CacheEntry, stillEntry } from "../shot-cache.ts";
import { logicalSize } from "../size.ts";
import { formatStepChoices, lastStop, resolveStop, stepKey } from "../step.ts";
import { loadSlideSources, renderSlideHtml, type SlideSources } from "../still-page.ts";

export type ShotFile = {
  slug: string;
  step: string;
  path: string;
  /** Set on a morph frame: the slide the transition goes to. */
  to?: string;
  /** Set on a morph frame: where in the transition the frame was taken, 0..1. */
  at?: number;
};

export type ShotDeckOptions = {
  slug?: string;
  step?: string;
  runner?: PlaywrightRunner;
};

export async function shotDeck(dir: string, options?: ShotDeckOptions): Promise<ShotFile[]>;
export async function shotDeck(
  source: ResolvedDeck,
  options?: ShotDeckOptions,
): Promise<ShotFile[]>;
export async function shotDeck(
  input: string | ResolvedDeck,
  options: ShotDeckOptions = {},
): Promise<ShotFile[]> {
  const { deck } = asResolvedDeck(input);
  const sections = options.slug
    ? deck.deck.sections.filter((section) => section.slug === options.slug)
    : deck.deck.sections;
  if (options.slug && sections.length === 0) {
    requireSection(deck, options.slug);
  }
  const stills = stillPages(deck, sections, options.step);
  await shootStills(deck, stills, options.runner);
  return stills.map(shotOf);
}

export type ShotSheet = {
  /** The contact sheets, in order; one unless the deck is too long for one. */
  sheets: string[];
  /** Each slide's own shot, the sheets' tiles at full size. */
  shots: ShotFile[];
};

/**
 * Every slide at its last beat, tiled on contact sheets, so the whole deck reads in one look.
 * The tiles are the slides' own shots, taken in the same browser run when they are stale; a deck
 * where nothing changed starts no browser at all.
 */
export async function shotSheet(
  dir: string,
  options?: { runner?: PlaywrightRunner },
): Promise<ShotSheet>;
export async function shotSheet(
  source: ResolvedDeck,
  options?: { runner?: PlaywrightRunner },
): Promise<ShotSheet>;
export async function shotSheet(
  input: string | ResolvedDeck,
  options: { runner?: PlaywrightRunner } = {},
): Promise<ShotSheet> {
  const { deck } = asResolvedDeck(input);
  const stills = stillPages(deck, deck.deck.sections);
  const cells = stills.map((still, i) => ({
    image: still.screenshotPath,
    label: `${i + 1} · ${still.slug}`,
  }));
  // The tiles' paths hash what they show, so the key changes whenever a tile does.
  const bundle = bundleEntry(
    deck.dir,
    "sheets",
    [],
    JSON.stringify([SHEET_LAYOUT_VERSION, deck.deck.title, cells]),
  );
  dropLinks(bundle.dir);
  const sheets = overviewSheets(cells, {
    slide: logicalSize(deck.deck.ratio),
    title: deck.deck.title,
    dir: bundle.dir,
  });
  await shootStills(deck, stills, options.runner, { sheets });
  bundle.commit();
  return { sheets: sheets.map((spec) => spec.path), shots: stills.map(shotOf) };
}

/**
 * The first slide at its last beat, as a link preview shows the talk. The shot is the one
 * `dekc shot` takes of that slide, cached by the rendered HTML, so a build only starts Chromium
 * when the first slide changed. Returns undefined when Playwright is not installed.
 */
export async function coverShot(
  deck: ResolvedDeck["deck"],
  runner?: PlaywrightRunner,
): Promise<string | undefined> {
  const stills = stillPages(deck, deck.deck.sections.slice(0, 1));
  const [still] = stills;
  if (!still) {
    return undefined;
  }
  const shot = await shootStills(deck, stills, runner, { ifMissing: "skip" });
  return shot ? still.screenshotPath : undefined;
}

export type Still = {
  html: string;
  slug: string;
  /** The step as it was asked for, or the beat's key. */
  step: string;
  screenshotPath: string;
  entry: CacheEntry;
};

/** One slide at one beat as `dekc shot` takes it: its page, and the cached shot it is named by. */
export function still(
  deck: ResolvedDeck["deck"],
  section: Section,
  beatIndex: number,
  sources: SlideSources,
  step: string = stepKey(section.beats, beatIndex),
): Still {
  const html = renderSlideHtml(sources, section.slug, beatIndex);
  const entry = stillEntry(deck.dir, section, beatIndex, html);
  return { html, slug: section.slug, step, screenshotPath: entry.path, entry };
}

/** The still as a page to render; it is shot only when its shot is not on disk yet. */
export function stillPage(still: Still): VisualPage {
  return {
    html: still.html,
    slug: still.slug,
    step: still.step,
    ...(still.entry.cached ? {} : { screenshotPath: still.screenshotPath }),
  };
}

/** Each section's still at `step` (its last beat when left out). */
function stillPages(deck: ResolvedDeck["deck"], sections: Section[], step?: string): Still[] {
  const sources = loadSlideSources(deck);
  return sections.map((section) => {
    const beat = resolveBeat(section, step);
    return still(deck, section, beat.index, sources, beat.label);
  });
}

/**
 * Shoots the stills not on disk yet, and draws `sheets` in the same browser run; with nothing to
 * shoot or draw, no browser starts. Older shots of the same stills go only once the run is done.
 * Without Playwright this throws, or with `ifMissing: "skip"` shoots nothing and answers false.
 */
async function shootStills(
  deck: ResolvedDeck["deck"],
  stills: Still[],
  runner: PlaywrightRunner | undefined,
  { sheets, ifMissing = "throw" }: { sheets?: SheetSpec[]; ifMissing?: "throw" | "skip" } = {},
): Promise<boolean> {
  const stale = stills.filter((still) => !still.entry.cached);
  if (stale.length > 0 || sheets?.some((spec) => !isCachedFile(spec.path))) {
    const request: PagesRequest = {
      kind: "pages",
      viewport: logicalSize(deck.deck.ratio),
      actions: [],
      pages: stale.map(stillPage),
      ...(sheets ? { sheets } : {}),
    };
    if (ifMissing === "throw") {
      await requirePlaywright(request, runner);
    } else if ((await askPlaywright(request, runner)) === null) {
      return false;
    }
  }
  for (const still of stills) {
    still.entry.commit();
  }
  return true;
}

function shotOf(still: Still): ShotFile {
  return { slug: still.slug, step: still.step, path: still.screenshotPath };
}

/** The beat `step` names in `section` (its last beat when left out), and its label. */
export function resolveBeat(section: Section, step?: string): { index: number; label: string } {
  const index = step === undefined ? lastStop(section.beats) : resolveStop(section.beats, step);
  if (index === undefined) {
    throw new DekError(`step "${step}" not found in "${section.slug}"`, {
      hint: stepNotFoundHint(section),
    });
  }
  return { index, label: step ?? stepKey(section.beats, index) };
}

function stepNotFoundHint(section: Section): string {
  return section.beats.length === 0
    ? "this slide has no beats; use 0, or leave out --step"
    : formatStepChoices([
        ...section.beats.flatMap((beat) => (beat.id ? [beat.id] : [])),
        `0-${section.beats.length}`,
      ]);
}
