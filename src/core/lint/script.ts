import { type Diagnostic, diag } from "../diagnostic.ts";
import type { DekcError } from "../error.ts";
import { ScriptError } from "../parse.ts";
import { scriptLines } from "../script-lines.ts";
import type { LintContext } from "./context.ts";

/** DEKC004: a section id or a beat id used twice. */
export function duplicateIdDiagnostics(ctx: LintContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const scriptPath = ctx.deck.scriptPath;
  const seenSlugs = new Set<string>();
  for (const section of ctx.deck.deck.sections) {
    if (seenSlugs.has(section.slug)) {
      diagnostics.push(
        diag("DEKC004", {
          message: `duplicate section id "${section.slug}"`,
          path: scriptPath,
          line: section.line,
          slug: section.slug,
          data: { id: section.slug },
        }),
      );
    } else {
      seenSlugs.add(section.slug);
    }

    const seenBeats = new Set<string>();
    for (const beat of section.beats) {
      if (!beat.id) {
        continue;
      }
      if (seenBeats.has(beat.id)) {
        diagnostics.push(
          diag("DEKC004", {
            message: `duplicate beat id "${beat.id}" in "${section.slug}"`,
            path: scriptPath,
            line: beat.line,
            slug: section.slug,
            data: { id: beat.id },
          }),
        );
      } else {
        seenBeats.add(beat.id);
      }
    }
  }
  return diagnostics;
}

/**
 * DEKC044: a `#` or `####` heading. Only `##` (slide) and `###` (beat) mean anything, so any
 * other level is read out as part of the script, `#` and all.
 */
export function strayHeadingDiagnostics(ctx: LintContext): Diagnostic[] {
  const { deck, script } = ctx;
  if (!script) {
    return [];
  }
  const starts = deck.deck.sections.map((section) => ({ line: section.line, slug: section.slug }));
  const diagnostics: Diagnostic[] = [];
  // What the parser reads as text, a code block or a comment, is not a heading here either.
  for (const [offset, { text, literal }] of scriptLines(script.body).entries()) {
    const level = literal ? undefined : text.match(/^(#{1,6})\s/)?.[1]?.length;
    if (level === undefined || level === 2 || level === 3) {
      continue;
    }
    const line = script.bodyStartLine + offset;
    // Under a slide heading it belongs to that slide; above the first, to the deck.
    const slug = starts.filter((start) => start.line < line).at(-1)?.slug;
    diagnostics.push(
      diag("DEKC044", {
        message: `${"#".repeat(level)} heading is not a slide or a beat; it is read as spoken text`,
        path: deck.scriptPath,
        line,
        ...(slug !== undefined ? { slug } : {}),
        hint: "use ## for a slide and ### for a beat, or drop the #",
        data: { level },
      }),
    );
  }
  return diagnostics;
}

/**
 * DEKC027: a script.md that cannot be read, one finding for each problem that stops it. Nothing
 * else in the deck can be checked against a script that does not read, so these are its findings.
 */
export function unreadableScriptDiagnostics(deck: {
  scriptPath: string;
  error: DekcError;
}): Diagnostic[] {
  const { error } = deck;
  const problems = error instanceof ScriptError ? error.problems : [error];
  return problems.map(({ message, line, hint }) =>
    diag("DEKC027", {
      message,
      path: error.path ?? deck.scriptPath,
      ...(line !== undefined ? { line } : {}),
      ...(hint !== undefined ? { hint } : {}),
    }),
  );
}
