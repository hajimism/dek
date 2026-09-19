import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "./error.ts";
import { loadSlideSources, renderSlideHtml } from "./html.ts";
import { cacheDir } from "./path.ts";
import {
  defaultPlaywrightRunner,
  type PlaywrightRunner,
  playwrightMissingError,
} from "./playwright.ts";
import { asResolvedDeck, type ResolvedDeck, requireSection } from "./resolve.ts";
import type { Section } from "./schema.ts";
import { logicalSize } from "./size.ts";

export type ShotFile = {
  slug: string;
  step: string;
  path: string;
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
  const runner = options.runner ?? defaultPlaywrightRunner;
  const sections = options.slug
    ? deck.deck.sections.filter((section) => section.slug === options.slug)
    : deck.deck.sections;
  if (options.slug && sections.length === 0) {
    requireSection(deck, options.slug);
  }

  const outDir = cacheDir(deck.dir, "shots");
  mkdirSync(outDir, { recursive: true });
  const sources = loadSlideSources(deck);

  const pages = sections.map((section) => {
    const beat = resolveBeat(section, options.step);
    const filename =
      options.step === undefined ? `${section.slug}.png` : `${section.slug}-${beat.label}.png`;
    return {
      html: renderSlideHtml(deck, section.slug, beat.index, sources),
      slug: section.slug,
      step: beat.label,
      screenshotPath: join(outDir, filename),
    };
  });

  const response = await runner({
    viewport: logicalSize(deck.deck.ratio),
    actions: ["screenshot"],
    pages,
  });
  if (response === null) {
    throw playwrightMissingError();
  }
  return pages.map((page) => ({
    slug: page.slug,
    step: page.step,
    path: page.screenshotPath,
  }));
}

function resolveBeat(section: Section, step?: string): { index: number; label: string } {
  const last = Math.max(section.beats.length - 1, 0);
  if (step === undefined) {
    const beat = section.beats[last];
    return { index: last, label: beat?.id ?? String(last + 1) };
  }
  if (/^[1-9]\d*$/.test(step)) {
    const index = Number(step) - 1;
    const beat = section.beats[index];
    if (beat) {
      return { index, label: beat.id ?? step };
    }
    if (section.beats.length === 0 && index === 0) {
      return { index: 0, label: step };
    }
    throw new DekError(`step "${step}" not found in "${section.slug}"`, {
      hint: "run `dek show` and pick a beat id or number",
    });
  }
  const index = section.beats.findIndex((beat) => beat.id === step);
  if (index < 0) {
    throw new DekError(`step "${step}" not found in "${section.slug}"`, {
      hint: "run `dek show` and pick a beat id or number",
    });
  }
  return { index, label: step };
}
