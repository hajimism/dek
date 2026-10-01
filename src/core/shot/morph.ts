import { DekcError } from "../error.ts";
import { type PlaywrightRunner, requirePlaywright } from "../playwright.ts";
import { asResolvedDeck, type ResolvedDeck, requireSection } from "../resolve.ts";
import { morphEntry } from "../shot-cache.ts";
import { logicalSize } from "../size.ts";
import { lastStop, stepKey } from "../step.ts";
import { videoDocument } from "../video-document.ts";
import type { ShotFile } from "./still.ts";

export type ShotMorphOptions = {
  from: string;
  to: string;
  /** Where in the transition, 0..1; `parseMorphAt` reads it from the command line. */
  at: number;
  /** The player runtime to embed; `playerScript()` from src/runtime. */
  playerScript: string;
  runner?: PlaywrightRunner;
};

/** `--at` as a number between 0 and 1; 0.5 when left out. */
export function parseMorphAt(value: string | undefined): number {
  if (value === undefined) {
    return 0.5;
  }
  // Number("") is 0: an empty value would pass for the start of the transition.
  return requireMorphAt(value.trim() === "" ? Number.NaN : Number(value), value);
}

function requireMorphAt(at: number, written: string = String(at)): number {
  if (!Number.isFinite(at) || at < 0 || at > 1) {
    throw new DekcError(`invalid --at "${written}"`, {
      hint: "use a number between 0 and 1, e.g. --at 0.5",
    });
  }
  return at;
}

/**
 * Screenshot the view transition from the last beat of `from` into beat 0 of
 * `to`, frozen at `at`. The page is the video document (all slides plus the
 * player runtime), so morphs and theme transitions run exactly as in `dekc video`.
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
  const resolved = asResolvedDeck(input);
  const { deck } = resolved;
  const at = requireMorphAt(options.at);
  const fromSection = requireSection(deck, options.from);
  const toSection = requireSection(deck, options.to);
  const from = {
    slideIndex: deck.deck.sections.indexOf(fromSection),
    beatIndex: lastStop(fromSection.beats),
  };
  const to = { slideIndex: deck.deck.sections.indexOf(toSection), beatIndex: 0 };
  const step = stepKey(fromSection.beats, from.beatIndex);

  const html = videoDocument(resolved, options.playerScript);
  const entry = morphEntry(deck.dir, options.from, options.to, at, html);
  if (!entry.cached) {
    await requirePlaywright(
      {
        kind: "morph",
        viewport: logicalSize(deck.deck.ratio),
        html,
        screenshotPath: entry.path,
        morph: { from, to, at },
      },
      options.runner,
    );
  }
  entry.commit();
  return [{ slug: options.from, step, path: entry.path, to: options.to, at }];
}
