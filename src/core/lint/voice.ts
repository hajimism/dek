import { cuesFromDeck, silentCues, unknownAsciiWords } from "../cue.ts";
import { deckPaths } from "../deck-paths.ts";
import { type Diagnostic, diag } from "../diagnostic.ts";
import { DekError } from "../error.ts";
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
 * DEK042, DEK043, DEK040, and DEK045, for a deck with voice/: a live-only deck is done without
 * narration, so these say nothing about it. A settings file that does not read is DEK045, and
 * only the checks that need it are skipped.
 */
export function voiceDiagnostics({ deck }: LintContext): Diagnostic[] {
  if (!hasVoice(deck.dir)) {
    return [];
  }
  const paths = deckPaths(deck.dir);
  const unreadable: Diagnostic[] = [];
  const read = <T>(path: string, load: () => T): T | undefined => {
    try {
      return load();
    } catch (error) {
      if (!(error instanceof DekError)) {
        throw error;
      }
      unreadable.push(
        diag("DEK045", {
          message: error.message,
          path: error.path ?? path,
          ...(error.line !== undefined ? { line: error.line } : {}),
          ...(error.hint !== undefined ? { hint: error.hint } : {}),
        }),
      );
      return undefined;
    }
  };
  const settings = read(paths.voiceToml, () => loadVoiceSettings(deck.dir));
  const unmatched = (settings ? resolveBeatTiming(deck.deck, settings).unknown : []).map((key) =>
    diag("DEK043", {
      message: `voice.toml [beats."${key}"] matches no slide or beat`,
      path: paths.voiceToml,
      data: { key },
    }),
  );
  const dict = read(paths.voiceDict, () => loadVoiceDict(deck.dir));
  const unknownWords =
    dict === undefined
      ? []
      : cuesFromDeck(deck.deck).flatMap((cue) =>
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
  return [...unreadable, ...silentCueDiagnostics(deck), ...unmatched, ...unknownWords];
}
