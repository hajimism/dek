import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "./config.ts";
import { renderDeckDocument } from "./document.ts";
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
import { formatStepChoices, stepChoices, stepKey } from "./step.ts";

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
 * The first slide at its last beat, as a link preview shows the talk. The shot is cached by
 * the rendered HTML, so a build only starts Chromium when the first slide changed. Returns
 * undefined when Playwright is not installed.
 */
export async function coverShot(
  deck: ResolvedDeck["deck"],
  runner: PlaywrightRunner = defaultPlaywrightRunner,
): Promise<string | undefined> {
  const [section] = deck.deck.sections;
  if (!section) {
    return undefined;
  }
  const beat = resolveBeat(section);
  const html = renderSlideHtml(deck, section.slug, beat.index, loadSlideSources(deck));
  const outDir = cacheDir(deck.dir, "shots");
  const filename = shotFileName(section.slug, beat.label, html);
  const screenshotPath = join(outDir, filename);
  if (existsSync(screenshotPath)) {
    return screenshotPath;
  }
  mkdirSync(outDir, { recursive: true });
  const response = await runner({
    viewport: logicalSize(deck.deck.ratio),
    actions: ["screenshot"],
    pages: [{ html, slug: section.slug, step: beat.label, screenshotPath }],
  });
  if (response === null) {
    return undefined;
  }
  pruneStaleShots(outDir, section.slug, beat.label, filename);
  return screenshotPath;
}

export type ShotMorphOptions = {
  from: string;
  to: string;
  at: number;
  /** The player runtime to embed; `playerScript()` from src/runtime. */
  playerScript: string;
  runner?: PlaywrightRunner;
};

export function parseMorphAt(value: string | undefined): number {
  if (value === undefined) {
    return 0.5;
  }
  const at = Number(value);
  if (!Number.isFinite(at) || at < 0 || at > 1) {
    throw new DekError(`invalid --at "${value}"`, {
      hint: "use a number between 0 and 1, e.g. --at 0.5",
    });
  }
  return at;
}

/**
 * Screenshot the view transition from the last beat of `from` into beat 0 of
 * `to`, frozen at `at`. The page is the video document (all slides plus the
 * player runtime), so morphs and theme transitions run exactly as in `dek video`.
 */
export async function shotMorph(dir: string, options: ShotMorphOptions): Promise<ShotFile[]>;
export async function shotMorph(
  source: ResolvedDeck,
  options: ShotMorphOptions,
): Promise<ShotFile[]>;
export async function shotMorph(
  input: string | ResolvedDeck,
  options: ShotMorphOptions,
): Promise<ShotFile[]> {
  const { project, deck } = asResolvedDeck(input);
  const runner = options.runner ?? defaultPlaywrightRunner;
  const at = parseMorphAt(String(options.at));
  const fromSection = requireSection(deck, options.from);
  const toSection = requireSection(deck, options.to);
  const from = {
    slideIndex: deck.deck.sections.indexOf(fromSection),
    beatIndex: Math.max(fromSection.beats.length - 1, 0),
  };
  const to = { slideIndex: deck.deck.sections.indexOf(toSection), beatIndex: 0 };

  const html = await renderDeckDocument(deck, {
    mode: "video",
    inlineAssets: true,
    includeNotes: false,
    config: loadConfig(project.configPath),
    playerScript: options.playerScript,
  });

  const outDir = cacheDir(deck.dir, "shots");
  mkdirSync(outDir, { recursive: true });
  const base = `${options.from}-to-${options.to}`;
  const filename = shotFileName(base, String(at), `${at}\0${html}`);
  pruneStaleShots(outDir, base, String(at), filename);
  const screenshotPath = join(outDir, filename);

  const response = await runner({
    viewport: logicalSize(deck.deck.ratio),
    actions: ["morph"],
    pages: [{ html, slug: options.from, step: String(from.beatIndex + 1), screenshotPath }],
    morph: { from, to, at },
  });
  if (response === null) {
    throw playwrightMissingError();
  }
  return [
    {
      slug: options.from,
      step: String(from.beatIndex + 1),
      path: screenshotPath,
      to: options.to,
      at,
    },
  ];
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
    return { index: last, label: stepKey(section.beats, last) };
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
      hint: stepNotFoundHint(section),
    });
  }
  const index = section.beats.findIndex((beat) => beat.id === step);
  if (index < 0) {
    throw new DekError(`step "${step}" not found in "${section.slug}"`, {
      hint: stepNotFoundHint(section),
    });
  }
  return { index, label: step };
}

function stepNotFoundHint(section: Section): string {
  return section.beats.length === 0
    ? "this slide has no beats; use 1, or leave out --step"
    : formatStepChoices(stepChoices(section.beats));
}
