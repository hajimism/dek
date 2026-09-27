import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import pkg from "../../../package.json";
import { DekError } from "../error.ts";
import { deckProjectRoot } from "../path.ts";
import { type PlaywrightRunner, requirePlaywright } from "../playwright.ts";
import { deckStops, retreat } from "../position.ts";
import { asResolvedDeck, type ResolvedDeck, requireSection } from "../resolve.ts";
import { dropLinks, isCachedFile, outputDir, replaceFile } from "../safe-fs.ts";
import type { Section } from "../schema.ts";
import { type MotionFrame, SHEET_LAYOUT_VERSION } from "../sheet.ts";
import { bundleEntry } from "../shot-cache.ts";
import { logicalSize } from "../size.ts";
import { beatAt, type Position, stepKey, stopCount } from "../step.ts";
import { videoDocument } from "../video-document.ts";
import { resolveBeat } from "./still.ts";

export type ShotMotionOptions = {
  slug: string;
  /** One beat alone, played from the beat before it; every beat when left out. */
  step?: string;
  /** The player runtime to embed; `playerScript()` from src/runtime. */
  playerScript: string;
  runner?: PlaywrightRunner;
};

export type ShotMotion = {
  slug: string;
  /** The contact sheets: a row per beat, its moments left to right, its settled end last. */
  sheets: string[];
  beats: Array<{ step: string; frames: MotionFrame[] }>;
};

/** Where each go is held before its end, as a share of how long it runs. */
const MOTION_FRACTIONS = [0, 0.25, 0.5, 0.75];

type MotionPlan = {
  /** Where the talk stands before the first beat plays; none at the start of the talk. */
  from?: Position;
  /** Each beat to play, in order, with its sheet row label and its step key. */
  beats: Array<{ position: Position; label: string; step: string }>;
};

/**
 * Which beats of `section` a motion plays, and from where: every beat from the slide before
 * (or the start of the talk), or with `step` that beat alone, from the beat before it.
 */
export function planMotion(section: Section, sections: Section[], step?: string): MotionPlan {
  const slideIndex = sections.indexOf(section);
  const indices =
    step === undefined
      ? Array.from({ length: stopCount(section.beats) }, (_, i) => i)
      : [resolveBeat(section, step).index];
  const first = indices[0] ?? 0;
  const from = retreat({ slideIndex, beatIndex: first }, deckStops(sections));
  const previous = sections[slideIndex - 1];
  const origin =
    first > 1
      ? `from beat ${first - 1}`
      : first === 1
        ? "from arrival"
        : previous
          ? `from ${previous.slug}`
          : "from the start";
  return {
    ...(from ? { from } : {}),
    beats: indices.map((beatIndex, i) => ({
      position: { slideIndex, beatIndex },
      label: [stopLabel(section, beatIndex), i === 0 ? origin : undefined]
        .filter(Boolean)
        .join(" · "),
      step: stepKey(section.beats, beatIndex),
    })),
  };
}

/**
 * A slide's beats in motion, each played the way the talk reaches it: the first from the slide
 * before (or the beat before, with a step), each after from the one it follows. Every go is held
 * at a few moments of everything it starts, the view transition, the slide's CSS animations and
 * transitions, and its script, then ended as `dek shot` ends it. The page is the video document,
 * so this is the motion the talk and `dek video` show.
 */
export async function shotMotion(dir: string, options: ShotMotionOptions): Promise<ShotMotion>;
export async function shotMotion(
  source: ResolvedDeck,
  options: ShotMotionOptions,
): Promise<ShotMotion>;
export async function shotMotion(
  input: string | ResolvedDeck,
  options: ShotMotionOptions,
): Promise<ShotMotion> {
  const resolved = asResolvedDeck(input);
  const { deck } = resolved;
  const section = requireSection(deck, options.slug);
  const plan = planMotion(section, deck.deck.sections, options.step);
  const beats = plan.beats.map(({ position, label }) => ({ position, label }));
  const first = plan.beats[0]?.position.beatIndex ?? 0;

  const html = videoDocument(resolved, options.playerScript);
  const title = `${section.slug} · motion`;
  // The page holds the player, but not the worker code that holds and seeks it; the version does.
  const key = `${JSON.stringify([pkg.version, SHEET_LAYOUT_VERSION, MOTION_FRACTIONS, plan.from, beats, title])}\0${html}`;
  // Each step keeps its own entry, so runs of different steps neither evict nor race each other.
  const capture = options.step === undefined ? [section.slug] : [section.slug, String(first)];
  const bundle = bundleEntry(deck.dir, "motion", capture, key);
  const manifest = join(bundle.dir, "motion.json");
  const cached = readMotionManifest(manifest, bundle.dir);
  if (cached) {
    bundle.commit();
    return cached;
  }
  // Chromium writes the frames and sheets by name, so no link may stand where one goes.
  dropLinks(bundle.dir);
  dropLinks(outputDir(join(bundle.dir, "frames"), deckProjectRoot(deck.dir)));

  const response = await requirePlaywright(
    {
      kind: "motion",
      viewport: logicalSize(deck.deck.ratio),
      html,
      motion: {
        ...(plan.from ? { from: plan.from } : {}),
        beats,
        fractions: MOTION_FRACTIONS,
        dir: bundle.dir,
        title,
      },
    },
    options.runner,
  );
  if (response.motion.length !== beats.length) {
    throw new DekError("the Playwright worker returned the wrong number of beats", {
      hint: `asked for ${beats.length}, got ${response.motion.length}; check DEK_PLAYWRIGHT`,
    });
  }
  const result: ShotMotion = {
    slug: section.slug,
    sheets: response.sheets,
    beats: response.motion.map((beat, i) => ({
      step: plan.beats[i]?.step ?? "0",
      frames: beat.frames,
    })),
  };
  replaceFile(manifest, `${JSON.stringify(result)}\n`);
  bundle.commit();
  return result;
}

/**
 * A motion answered before, while every file it names is still there. The cache is dek's own
 * output, but a manifest that does not read back whole, or names a file outside its own folder,
 * is taken again rather than trusted.
 */
function readMotionManifest(path: string, dir: string): ShotMotion | undefined {
  if (!isCachedFile(path)) {
    return undefined;
  }
  try {
    const result = JSON.parse(readFileSync(path, "utf8")) as ShotMotion;
    const files = [
      ...result.sheets,
      ...result.beats.flatMap((beat) => beat.frames.map((frame) => frame.path)),
    ];
    const inDir = (file: unknown): file is string => {
      if (typeof file !== "string") {
        return false;
      }
      const rel = relative(dir, file);
      return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
    };
    // Every path is checked to be in the folder before any is looked at, since a look removes a link.
    return files.length > 0 && files.every(inDir) && files.every((file) => isCachedFile(file))
      ? result
      : undefined;
  } catch {
    return undefined;
  }
}

/** "arrival" for a slide as it arrives; "beat 2 · hook" at a beat. */
function stopLabel(section: Section, beatIndex: number): string {
  if (beatIndex === 0) {
    return "arrival";
  }
  return [`beat ${beatIndex}`, beatAt(section.beats, beatIndex)?.id].filter(Boolean).join(" · ");
}
