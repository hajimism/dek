import { DekError } from "../core/error.ts";
import { type Diagnostic, lintDeck } from "../core/index.ts";
import { lintVisualDeck } from "../core/visual.ts";
import { hasVoice, loadCachedTimeline } from "../core/voice.ts";
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
  visual: "ok" | "skipped";
  shot?: string;
  voice?: { beats: VoiceCheckBeat[] };
};

export async function checkCommand(options: {
  cwd: string;
  slug?: string;
  shot?: boolean;
  voice?: boolean;
  deck?: string;
}): Promise<CheckCliResult> {
  const slug = options.slug?.trim();
  if (!slug) {
    throw new DekError("usage: dek check <slug>", { hint: "usage: dek check <slug>" });
  }

  const { project, deck } = requireDeckFromCwd(options.cwd, options.deck);
  requireSection(deck, slug);

  const diagnostics = lintDeck({ project, deck }, { slug });
  const visual = await lintVisualDeck(deck.dir, { slug, deck });
  if (visual) {
    diagnostics.push(...visual);
  }

  let shot: string | undefined;
  if (options.shot) {
    const { shotDeck } = await import("../core/shot.ts");
    const shots = await shotDeck({ project, deck }, { slug });
    shot = shots[0]?.path;
  }

  let voice: CheckCliResult["voice"];
  if (options.voice) {
    if (!hasVoice(deck.dir)) {
      throw new DekError("voice.toml not found", {
        path: `${deck.dir}/voice/voice.toml`,
        hint: "add voice/voice.toml or run `dek voice` after copying from dek.toml [voice]",
      });
    }
    const { synthDeck } = await import("../voice/synth.ts");
    await synthDeck({ project, deck });
    const timeline = loadCachedTimeline(project.root, deck.name);
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
    visual: visual === null ? "skipped" : "ok",
    ...(shot ? { shot } : {}),
    ...(voice ? { voice } : {}),
  };
}
