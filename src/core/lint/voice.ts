import { cuesFromDeck, silentCues, unknownAsciiWords } from "../cue.ts";
import { deckPaths } from "../deck-paths.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import type { ProjectDeck } from "../resolve.ts";
import { hasVoice, loadVoiceDict, loadVoiceSettings, resolveBeatTiming } from "../voice.ts";
import type { LintContext } from "./context.ts";

/** DEK042: a beat that shows a list, code, or table but has nothing to say. */
export function silentCueDiagnostics(deck: ProjectDeck): Diagnostic[] {
  return silentCues(deck.deck).map((cue) => {
    const where =
      cue.position.beatIndex > 0 ? `"${cue.slug}" beat ${cue.position.beatIndex}` : `"${cue.slug}"`;
    return diag("DEK042", {
      message: `no spoken paragraph in ${where}; lists, code, and tables are not synthesized`,
      path: deck.scriptPath,
      line: cue.line,
      slug: cue.slug,
    });
  });
}

/**
 * DEK042, DEK043, and DEK040, for a deck with voice/: a live-only deck is done without
 * narration, so these say nothing about it.
 */
export function voiceDiagnostics({ deck }: LintContext): Diagnostic[] {
  if (!hasVoice(deck.dir)) {
    return [];
  }
  const voiceToml = deckPaths(deck.dir).voiceToml;
  const unmatched = resolveBeatTiming(deck.deck, loadVoiceSettings(deck.dir)).unknown.map((key) =>
    diag("DEK043", {
      message: `voice.toml [beats."${key}"] matches no slide or beat`,
      path: voiceToml,
      data: { key },
    }),
  );
  const dict = loadVoiceDict(deck.dir);
  const unknownWords = cuesFromDeck(deck.deck).flatMap((cue) =>
    unknownAsciiWords(cue.paragraphs.join("\n"), dict).map((word) =>
      diag("DEK040", {
        message: `dictionary is missing English word: ${word} in "${cue.slug}"`,
        path: deck.scriptPath,
        line: cue.line,
        slug: cue.slug,
        data: { word },
      }),
    ),
  );
  return [...silentCueDiagnostics(deck), ...unmatched, ...unknownWords];
}
