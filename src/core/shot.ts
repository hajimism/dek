import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DekError } from "./error.ts";
import { renderSlideHtml } from "./html.ts";
import { defaultPlaywrightRunner, type PlaywrightRunner } from "./playwright.ts";
import { asResolvedDeck, type ResolvedDeck } from "./resolve.ts";
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
  const { project, deck } = asResolvedDeck(input);
  const runner = options.runner ?? defaultPlaywrightRunner;
  const sections = options.slug
    ? deck.deck.sections.filter((section) => section.slug === options.slug)
    : deck.deck.sections;
  if (options.slug && sections.length === 0) {
    throw new DekError(`section "${options.slug}" not found`, {
      path: deck.scriptPath,
      hint: "run `dek ls`",
    });
  }

  const outDir = join(project.root, ".dek", "shots", deck.name);
  mkdirSync(outDir, { recursive: true });

  const pages = sections.map((section) => {
    const beat = resolveBeat(section, options.step);
    const filename =
      options.step === undefined ? `${section.slug}.png` : `${section.slug}-${beat.label}.png`;
    return {
      html: renderSlideHtml(deck, section.slug, beat.index),
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
    throw new DekError("Playwright is not installed", { hint: "bunx playwright install" });
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
    if (section.beats.length > 0 && !beat) {
      throw new DekError(`step "${step}" not found in "${section.slug}"`, {
        hint: "run `dek show` and pick a beat id or number",
      });
    }
    return { index: beat ? index : 0, label: beat?.id ?? step };
  }
  const index = section.beats.findIndex((beat) => beat.id === step);
  if (index < 0) {
    throw new DekError(`step "${step}" not found in "${section.slug}"`, {
      hint: "run `dek show` and pick a beat id or number",
    });
  }
  return { index, label: step };
}
