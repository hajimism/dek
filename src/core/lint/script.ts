import { type Diagnostic, diag } from "../diagnostic.ts";
import { splitLines } from "../lines.ts";
import type { LintContext } from "./context.ts";

/** DEK004: a section id or a beat id used twice. */
export function duplicateIdDiagnostics(ctx: LintContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const scriptPath = ctx.deck.scriptPath;
  const seenSlugs = new Set<string>();
  for (const section of ctx.deck.deck.sections) {
    if (seenSlugs.has(section.slug)) {
      diagnostics.push(
        diag("DEK004", {
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
          diag("DEK004", {
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
 * DEK044: a `#` or `####` heading. Only `##` (slide) and `###` (beat) mean anything, so any
 * other level is read out as part of the script, `#` and all.
 */
export function strayHeadingDiagnostics(ctx: LintContext): Diagnostic[] {
  const { deck, script } = ctx;
  if (!script) {
    return [];
  }
  const starts = deck.deck.sections.map((section) => ({ line: section.line, slug: section.slug }));
  const diagnostics: Diagnostic[] = [];
  let fence: string | undefined;
  for (const [offset, text] of splitLines(script.body).entries()) {
    const marker = text.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker) {
      fence = fence === undefined ? marker : text.trim().startsWith(fence) ? undefined : fence;
      continue;
    }
    const level = fence === undefined ? text.match(/^(#{1,6})\s/)?.[1]?.length : undefined;
    if (level === undefined || level === 2 || level === 3) {
      continue;
    }
    const line = script.bodyStartLine + offset;
    // Under a slide heading it belongs to that slide; above the first, to the deck.
    const slug = starts.filter((start) => start.line < line).at(-1)?.slug;
    diagnostics.push(
      diag("DEK044", {
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
