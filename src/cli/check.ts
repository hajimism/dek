import { DekError } from "../core/error.ts";
import { type Diagnostic, lintDeck } from "../core/index.ts";
import {
  PLAYWRIGHT_INSTALL,
  type PlaywrightRunner,
  playwrightMissingError,
} from "../core/playwright.ts";
import { runVisualDeck } from "../core/visual.ts";
import { hasVoice, loadCachedTimeline, VOICE_SETUP_HINT } from "../core/voice.ts";
import { type SkippedCheck, skippedChecks } from "./result.ts";
import { requireDeckFromCwd, requireSection } from "./scope.ts";

export type VoiceCheckBeat = {
  beatIndex: number;
  durationMs: number;
  empty: boolean;
  sentences: Array<{ text: string; kana: string; start: number; end: number }>;
};

export type CheckCliResult = {
  slug: string;
  diagnostics: Diagnostic[];
  /** Checks that did not run, each with why and how to run it, so an empty list is not a pass. */
  skipped?: SkippedCheck[];
  shot?: string;
  voice?: { beats: VoiceCheckBeat[] };
};

export async function checkCommand(options: {
  cwd: string;
  slug?: string;
  shot?: boolean;
  voice?: boolean;
  deck?: string;
  runner?: PlaywrightRunner;
}): Promise<CheckCliResult> {
  const slug = options.slug?.trim();
  if (!slug) {
    throw new DekError("usage: dek check <slug>", { hint: "run `dek ls` to see the slugs" });
  }

  const { project, deck } = requireDeckFromCwd(options.cwd, options.deck);
  requireSection(deck, slug);

  const diagnostics = lintDeck({ project, deck }, { slug });
  const visual = await runVisualDeck(
    { project, deck },
    {
      slug,
      screenshot: options.shot === true,
      ...(options.runner ? { runner: options.runner } : {}),
    },
  );
  if (visual) {
    diagnostics.push(...visual.diagnostics);
  } else if (options.shot) {
    throw playwrightMissingError();
  }

  const shot = visual?.screenshotPath;

  const skipped: SkippedCheck[] = visual
    ? []
    : [
        {
          check: "visual",
          reason: "Playwright is not installed",
          hint: `${PLAYWRIGHT_INSTALL} to also check overflow and contrast`,
        },
      ];

  // A live-only deck is done without voice, so asking for it skips the check rather than failing,
  // the way a missing Playwright skips visual.
  let voice: CheckCliResult["voice"];
  if (options.voice && !hasVoice(deck.dir)) {
    skipped.push({
      check: "voice",
      reason: "the deck has no voice/voice.toml",
      hint: VOICE_SETUP_HINT,
    });
  } else if (options.voice) {
    const { synthDeck } = await import("../voice/synth.ts");
    await synthDeck({ project, deck });
    const timeline = loadCachedTimeline(deck.dir);
    if (!timeline) {
      throw new DekError("Timeline not found", {
        hint: "run `dek voice`",
      });
    }
    const slideIndex = deck.deck.sections.findIndex((entry) => entry.slug === slug);
    voice = {
      beats: timeline.beats
        .filter((beat) => beat.position.slideIndex === slideIndex)
        .map((beat) => ({
          beatIndex: beat.position.beatIndex,
          durationMs: beat.end - beat.start,
          empty: beat.sentences.length === 0,
          sentences: beat.sentences,
        })),
    };
  }

  return {
    slug,
    diagnostics,
    ...skippedChecks(skipped),
    ...(shot ? { shot } : {}),
    ...(voice ? { voice } : {}),
  };
}
