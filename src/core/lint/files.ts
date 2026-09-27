import { type Diagnostic, diag } from "../diagnostic.ts";
import { listSlideFiles, SLIDE_SIDECARS } from "../resolve.ts";
import type { LintContext } from "./context.ts";

/** DEK001 for a section without slides/<slug>.html; DEK002 for a slide file without its section. */
export function pairingDiagnostics(ctx: LintContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const section of ctx.deck.deck.sections) {
    if (ctx.slidesBySlug.has(section.slug)) {
      continue;
    }
    diagnostics.push(
      diag("DEK001", {
        message: `missing slide HTML for "${section.slug}"`,
        path: ctx.deck.scriptPath,
        line: section.line,
        slug: section.slug,
        hint: "run `dek sync` to create the skeleton",
        data: { expected: `slides/${section.slug}.html` },
      }),
    );
  }

  for (const slide of ctx.slidesBySlug.values()) {
    if (ctx.sectionsBySlug.has(slide.slug)) {
      continue;
    }
    diagnostics.push(
      diag("DEK002", {
        message: `slide HTML has no section "${slide.slug}"`,
        path: slide.path,
        slug: slide.slug,
        data: { slug: slide.slug, file: `slides/${slide.slug}.html` },
      }),
    );
  }

  for (const ext of SLIDE_SIDECARS) {
    const kind = ext === ".css" ? "stylesheet" : "script";
    for (const file of listSlideFiles(ctx.deck.dir, ext)) {
      // A sidecar next to an orphaned HTML file travels with it; DEK002 already names the slug.
      if (ctx.sectionsBySlug.has(file.slug) || ctx.slidesBySlug.has(file.slug)) {
        continue;
      }
      diagnostics.push(
        diag("DEK002", {
          message: `slide ${kind} has no section "${file.slug}"`,
          path: file.path,
          slug: file.slug,
          data: { slug: file.slug, file: `slides/${file.slug}${ext}` },
        }),
      );
    }
  }
  return diagnostics;
}

/**
 * One orphaned HTML file and one section without its own HTML look like a
 * heading renamed in script.md first. The section either has no HTML yet, or
 * only the skeleton the dev server generated on save. `dek mv` handles both,
 * so both diagnostics get that hint.
 */
export function suggestRename(diagnostics: Diagnostic[], ctx: LintContext): Diagnostic[] {
  const orphans = diagnostics.filter(
    (diagnostic) => diagnostic.id === "DEK002" && diagnostic.path?.endsWith(".html"),
  );
  const [orphan] = orphans;
  if (orphans.length !== 1 || !orphan?.slug) {
    return diagnostics;
  }
  const missing = diagnostics.filter((diagnostic) => diagnostic.id === "DEK001");
  const targets =
    missing.length > 0
      ? missing.flatMap((diagnostic) => (diagnostic.slug ? [diagnostic.slug] : []))
      : ctx.deck.deck.sections
          .filter((section) => ctx.slideSource(section.slug)?.skeleton === true)
          .map((section) => section.slug);
  const [target] = targets;
  if (targets.length !== 1 || !target) {
    return diagnostics;
  }
  const hint = `run \`dek mv ${orphan.slug} ${target}\``;
  const renamed = new Set<Diagnostic>([orphan, ...missing]);
  return diagnostics.map((diagnostic) =>
    renamed.has(diagnostic) ? { ...diagnostic, hint } : diagnostic,
  );
}
