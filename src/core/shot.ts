import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, rmSync } from "node:fs";
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
    const html = renderSlideHtml(deck, section.slug, beat.index, sources);
    const step = options.step === undefined ? undefined : beat.label;
    const filename = shotFileName(section.slug, step, html);
    pruneStaleShots(outDir, section.slug, step, filename);
    return {
      html,
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

/**
 * `<slug>[-<step>].<hash>.png`, where the hash covers the rendered HTML
 * (theme, slide, shown steps, inlined assets). A changed rendering gets a
 * new path, so nothing that caches by path can show a stale image.
 */
export function shotFileName(slug: string, step: string | undefined, html: string): string {
  const hash = createHash("sha256").update(html).digest("hex").slice(0, 8);
  return `${shotBaseName(slug, step)}.${hash}.png`;
}

/** Remove other hashes (and the legacy unhashed name) for the same slug/step. */
export function pruneStaleShots(
  dir: string,
  slug: string,
  step: string | undefined,
  keep: string,
): void {
  const base = shotBaseName(slug, step).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const stale = new RegExp(`^${base}(?:\\.[0-9a-f]{8})?\\.png$`);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (name !== keep && stale.test(name)) {
      rmSync(join(dir, name), { force: true });
    }
  }
}

function shotBaseName(slug: string, step: string | undefined): string {
  return step === undefined ? slug : `${slug}-${step}`;
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
