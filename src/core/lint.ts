import { cssClassNames, cssLayoutNames } from "./css.ts";
import type { Diagnostic } from "./diagnostic.ts";
import { type DeckFiles, type LintContext, readDeckFiles } from "./lint/context.ts";
import { pairingDiagnostics, suggestRename } from "./lint/files.ts";
import { frontmatterKeyDiagnostics, tomlKeyDiagnostics } from "./lint/keys.ts";
import { unpairedMorphDiagnostics } from "./lint/morph.ts";
import { duplicateIdDiagnostics, strayHeadingDiagnostics } from "./lint/script.ts";
import { sharedStyleDiagnostics } from "./lint/shared-styles.ts";
import { lintSlideHtml } from "./lint/slide-html.ts";
import {
  javascriptDiagnostics,
  type LintedScript,
  lintedSlideScripts,
  slideScriptDiagnostics,
} from "./lint/slide-script.ts";
import { lintSlideStyle, themeDiagnostics } from "./lint/theme-css.ts";
import { timingDiagnostics } from "./lint/timing.ts";
import { voiceDiagnostics } from "./lint/voice.ts";
import { asResolvedDeck, type Project, type ProjectDeck } from "./resolve.ts";
import type { Section } from "./schema.ts";
import { evaluateSlideScripts, slideScriptsProblems } from "./slide-script-eval.ts";

export { unreadableScriptDiagnostics } from "./lint/script.ts";
export { silentCueDiagnostics } from "./lint/voice.ts";

export type LintDeckOptions = {
  /** Only this slide's findings: the ones that name it. Deck findings are `dekc lint`'s. */
  slug?: string;
};

type DeckInput = string | { project: Project; deck: ProjectDeck };

/**
 * The project's own findings (DEK008 on dek.toml): the same for every deck, so a command that
 * covers several decks reports them once, beside each deck's `lintDeck`.
 */
export function lintProject(project: Project): Diagnostic[] {
  return tomlKeyDiagnostics(project);
}

/**
 * Every deck and slide rule over one deck, or with `slug` only that slide's. Each module under
 * lint/ owns the rules of one kind of file and exports them as functions of the shared context;
 * this puts their findings in order. Slide scripts are evaluated first, in a child process that
 * this waits for; the dev server uses `lintDeckAsync` instead.
 */
export function lintDeck(dir: string, options?: LintDeckOptions): Diagnostic[];
export function lintDeck(
  source: { project: Project; deck: ProjectDeck },
  options?: LintDeckOptions,
): Diagnostic[];
export function lintDeck(input: DeckInput, options?: LintDeckOptions): Diagnostic[] {
  const { files, scripted } = readLintInput(input);
  const problems = slideScriptsProblems(scripted.map((entry) => entry.input));
  return runRules({ ...files, scripts: slideScriptDiagnostics(scripted, problems) }, options);
}

/**
 * `lintDeck` that evaluates slide scripts off the event loop. The scripts are read once, before
 * the evaluation, so one saved meanwhile is checked on the next pass instead of in this one.
 */
export async function lintDeckAsync(
  input: DeckInput,
  options?: LintDeckOptions,
): Promise<Diagnostic[]> {
  const { files, scripted } = readLintInput(input);
  const problems = await evaluateSlideScripts(scripted.map((entry) => entry.input));
  return runRules({ ...files, scripts: slideScriptDiagnostics(scripted, problems) }, options);
}

function readLintInput(input: DeckInput): { files: DeckFiles; scripted: LintedScript[] } {
  const { project, deck } = asResolvedDeck(input);
  const files = readDeckFiles(project, deck);
  return { files, scripted: lintedSlideScripts(files) };
}

/**
 * A finding with a slug is about that slide; one without is about the deck. So one slide's
 * check is the findings that name it, whichever rule made them: no rule filters on its own.
 */
function runRules(ctx: LintContext, options: LintDeckOptions | undefined): Diagnostic[] {
  const diagnostics = [
    ...frontmatterKeyDiagnostics(ctx),
    ...suggestRename(
      [
        ...duplicateIdDiagnostics(ctx),
        ...pairingDiagnostics(ctx),
        ...javascriptDiagnostics(ctx),
        ...themeDiagnostics(ctx),
        ...[...ctx.sectionsBySlug.values()].flatMap((section) => slideDiagnostics(ctx, section)),
        ...unpairedMorphDiagnostics(ctx),
        ...sharedStyleDiagnostics(ctx),
      ],
      ctx,
    ),
    ...voiceDiagnostics(ctx),
    ...strayHeadingDiagnostics(ctx),
    ...timingDiagnostics(ctx),
  ];
  const slug = options?.slug;
  return slug === undefined
    ? diagnostics
    : diagnostics.filter((diagnostic) => diagnostic.slug === slug);
}

/** Everything about one slide that has HTML: its stylesheet, its script, then its markup. */
function slideDiagnostics(ctx: LintContext, section: Section): Diagnostic[] {
  const slide = ctx.slidesBySlug.get(section.slug);
  const source = ctx.slideSource(section.slug);
  if (!slide || !source) {
    return [];
  }
  const style = ctx.slideStyle(section.slug);
  const sheet = style?.sheet;
  const script = ctx.scripts.get(section.slug);
  return [
    ...(style
      ? lintSlideStyle(section.slug, style.path, style.sheet, ctx.theme?.tokens ?? [], ctx.deck.dir)
      : []),
    ...(script ?? []),
    ...lintSlideHtml(section, slide.path, source.scan, {
      deckDir: ctx.deck.dir,
      skeleton: source.skeleton,
      hasScript: script !== undefined,
      classes: ctx.theme && new Set([...ctx.theme.classes, ...(sheet ? cssClassNames(sheet) : [])]),
      // A theme with no layouts at all has nothing to check a data-layout against.
      ...(ctx.theme && ctx.theme.layouts.length > 0
        ? {
            layouts: new Set([
              ...ctx.theme.layouts.map((layout) => layout.name),
              ...(sheet ? cssLayoutNames(sheet) : []),
            ]),
          }
        : {}),
    }),
  ];
}
