import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { classifyAssetRef, isCanonicalAssetPath } from "./assets.ts";
import { type DekConfig, loadConfig } from "./config.ts";
import {
  FRONTMATTER_KEYS,
  type UnknownKey,
  unknownFrontmatterKeys,
  unknownTomlKeys,
} from "./config-keys.ts";
import {
  cssAtRuleNames,
  cssClassNames,
  cssCustomProperties,
  cssDeclarations,
  cssLayoutNames,
  cssStyleSelectors,
  cssTokenValues,
  cssUrls,
  isScopedThemeSelector,
  splitSelectorList,
  topLevelSelectors,
} from "./css.ts";
import { cuesFromDeck, silentCues, unknownAsciiWords } from "./cue.ts";
import { type Diagnostic, diag } from "./diagnostic.ts";
import {
  type HtmlAttribute,
  type HtmlRef,
  type HtmlScan,
  isUrlAttribute,
  type SourceSpot,
  scanSlideHtml,
} from "./html.ts";
import { splitLines } from "./lines.ts";
import {
  asResolvedDeck,
  listSlideFiles,
  listSlides,
  type Project,
  type ProjectDeck,
  readTextIfExists,
  SLIDE_SIDECARS,
} from "./resolve.ts";
import type { Beat, Section } from "./schema.ts";
import {
  javascriptScriptProblem,
  seekProblems,
  slideScriptsProblems,
  warmSlideScripts,
} from "./slide-script.ts";
import { formatStepChoices, stepChoices, stepKey } from "./step.ts";
import { suggest } from "./suggest.ts";
import { skeletonHtml } from "./sync.ts";
import type { Timeline } from "./timeline.ts";
import { formatClock, parseDurationSeconds, sectionTiming } from "./timing.ts";
import { isRawThemeValue, REQUIRED_TOKENS, rawValueHint } from "./tokens.ts";
import {
  hasVoice,
  loadVoiceDict,
  loadVoiceSettings,
  resolveBeatTiming,
  tryLoadCachedTimeline,
  voiceDir,
} from "./voice.ts";

/**
 * view-transition-names a data-morph may not take. The player names the slide box "slide",
 * the browser names the page "root", and the rest are keywords of the property itself.
 */
const RESERVED_MORPHS = new Set(["slide", "root", "none", "auto", "match-element"]);

export const DURATION_DRIFT_RATIO = 0.2;
/** The reading-time estimate leaves out pauses and demos, so it gets more room than a Timeline. */
const ESTIMATE_DRIFT_RATIO = 0.35;

const POSITIVE_INT_RE = /^[1-9]\d*$/;

export type LintDeckOptions = {
  slug?: string;
};

/**
 * Evaluates the slide scripts `lintDeck` will check in the background, so a
 * following `lintDeck` answers from the cache instead of blocking on a child
 * process. The dev server awaits this before each lint.
 */
export async function warmLintDeck(
  input: string | { project: Project; deck: ProjectDeck },
  options?: LintDeckOptions,
): Promise<void> {
  const { deck } = asResolvedDeck(input);
  await warmSlideScripts(lintedSlideScripts(deck, options?.slug).map((entry) => entry.input));
}

/** The `slides/<slug>.ts` scripts lint evaluates: one per section that has HTML. */
function lintedSlideScripts(
  deck: ProjectDeck,
  only: string | undefined,
): Array<{ section: Section; path: string; input: { code: string; steps: string[] } }> {
  const html = new Set(listSlides(deck.dir).map((slide) => slide.slug));
  const scripts = new Map(listSlideFiles(deck.dir, ".ts").map((file) => [file.slug, file.path]));
  return uniqueSections(deck.deck.sections).flatMap((section) => {
    const path = scripts.get(section.slug);
    if (!path || !html.has(section.slug) || (only !== undefined && only !== section.slug)) {
      return [];
    }
    const steps = Array.from({ length: Math.max(1, section.beats.length) }, (_, index) =>
      stepKey(section.beats, index),
    );
    return [{ section, path, input: { code: readFileSync(path, "utf8"), steps } }];
  });
}

export function lintDeck(dir: string, options?: LintDeckOptions): Diagnostic[];
export function lintDeck(
  source: { project: Project; deck: ProjectDeck },
  options?: LintDeckOptions,
): Diagnostic[];
export function lintDeck(
  input: string | { project: Project; deck: ProjectDeck },
  options?: LintDeckOptions,
): Diagnostic[] {
  const { project, deck } = asResolvedDeck(input);
  const ctx = lintContext(project, deck, options?.slug);
  const scripts = slideScriptDiagnostics(ctx);
  const diagnostics = [
    ...duplicateIdDiagnostics(ctx),
    ...pairingDiagnostics(ctx),
    ...javascriptDiagnostics(ctx),
    ...(ctx.theme
      ? lintTheme(ctx.theme.path, ctx.theme.css, ctx.config.maxClasses)
      : [missingThemeDiagnostic(ctx)]),
    ...uniqueSections(deck.deck.sections).flatMap((section) =>
      slideDiagnostics(ctx, section, scripts),
    ),
  ];
  return [
    ...(ctx.only === undefined ? unknownKeyDiagnostics(project, deck) : []),
    ...suggestRename(diagnostics, deck, ctx.slidesBySlug),
    ...(hasVoice(deck.dir) ? lintVoice(deck, ctx.only) : []),
    ...strayHeadingDiagnostics(ctx),
    ...timingDiagnostics(ctx),
  ];
}

/**
 * DEK008: a key in dek.toml or the frontmatter that dek does not read. Parsing drops it
 * without a word, so a typo leaves the default in place and nobody knows why.
 */
function unknownKeyDiagnostics(project: Project, deck: ProjectDeck): Diagnostic[] {
  const toml = unknownTomlKeys(readTextIfExists(project.configPath) ?? "").map((key) =>
    unknownKeyDiagnostic(key, { file: "dek.toml", path: project.configPath }),
  );
  const frontmatter = unknownFrontmatterKeys(readTextIfExists(deck.scriptPath) ?? "").map((key) =>
    unknownKeyDiagnostic(key, { file: "frontmatter", path: deck.scriptPath }),
  );
  return [...toml, ...frontmatter];
}

function unknownKeyDiagnostic(
  { key, line, suggestion }: UnknownKey,
  where: { file: "dek.toml" | "frontmatter"; path: string },
): Diagnostic {
  const place = where.file === "dek.toml" ? "dek.toml" : "the frontmatter";
  const known =
    where.file === "dek.toml"
      ? `see ${REFERENCE_URL}#dek-toml`
      : `the keys are ${FRONTMATTER_KEYS.join(", ")}; see ${REFERENCE_URL}#frontmatter`;
  return diag("DEK008", {
    message: `unknown key ${key} in ${place}; dek ignores it`,
    path: where.path,
    line,
    hint: suggestion ? `did you mean ${suggestion}?` : known,
    data: { file: where.file, key, ...(suggestion ? { suggestion } : {}) },
  });
}

const REFERENCE_URL = "https://hajimism.github.io/dek/reference/config.html";

type SlideFile = { slug: string; path: string };

/** What every rule reads: the deck, its config, the slug filter, and the files beside script.md. */
type LintContext = {
  deck: ProjectDeck;
  config: DekConfig;
  /** The one slug lint was asked for, when it was. */
  only?: string;
  /** True when `slug` is the one asked for, or when every slide was. */
  matches(slug: string): boolean;
  /** The first section of each slug; a second one is DEK004. */
  sectionsBySlug: Map<string, Section>;
  slidesBySlug: Map<string, SlideFile>;
  stylesBySlug: Map<string, SlideFile>;
  /** theme.css, parsed once for every rule that reads it. */
  theme?: {
    path: string;
    css: string;
    classes: Set<string>;
    layouts: Set<string>;
    tokens: ThemeToken[];
  };
};

type ThemeToken = { name: string; value: string };

function lintContext(project: Project, deck: ProjectDeck, only?: string): LintContext {
  const themePath = join(deck.dir, "theme.css");
  const themeCss = readTextIfExists(themePath);
  const sectionsBySlug = new Map<string, Section>();
  for (const section of deck.deck.sections) {
    if (!sectionsBySlug.has(section.slug)) {
      sectionsBySlug.set(section.slug, section);
    }
  }
  return {
    deck,
    config: loadConfig(project.configPath),
    ...(only === undefined ? {} : { only }),
    matches: (slug) => only === undefined || only === slug,
    sectionsBySlug,
    slidesBySlug: new Map(listSlides(deck.dir).map((slide) => [slide.slug, slide])),
    stylesBySlug: new Map(listSlideFiles(deck.dir, ".css").map((file) => [file.slug, file])),
    ...(themeCss === undefined
      ? {}
      : {
          theme: {
            path: themePath,
            css: themeCss,
            classes: cssClassNames(themeCss),
            layouts: cssLayoutNames(themeCss),
            tokens: cssTokenValues(themeCss),
          },
        }),
  };
}

/** DEK004: a section id or a beat id used twice. */
function duplicateIdDiagnostics(ctx: LintContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const scriptPath = ctx.deck.scriptPath;
  const seenSlugs = new Set<string>();
  for (const section of ctx.deck.deck.sections) {
    if (seenSlugs.has(section.slug)) {
      if (ctx.matches(section.slug)) {
        diagnostics.push(
          diag("DEK004", {
            message: `duplicate section id "${section.slug}"`,
            path: scriptPath,
            line: section.line,
            slug: section.slug,
            data: { id: section.slug },
          }),
        );
      }
    } else {
      seenSlugs.add(section.slug);
    }

    const seenBeats = new Set<string>();
    for (const beat of section.beats) {
      if (!beat.id) {
        continue;
      }
      if (seenBeats.has(beat.id)) {
        if (ctx.matches(section.slug)) {
          diagnostics.push(
            diag("DEK004", {
              message: `duplicate beat id "${beat.id}" in "${section.slug}"`,
              path: scriptPath,
              line: beat.line,
              slug: section.slug,
              data: { id: beat.id },
            }),
          );
        }
      } else {
        seenBeats.add(beat.id);
      }
    }
  }
  return diagnostics;
}

/** DEK001 for a section without slides/<slug>.html; DEK002 for a slide file without its section. */
function pairingDiagnostics(ctx: LintContext): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const section of ctx.deck.deck.sections) {
    if (ctx.slidesBySlug.has(section.slug) || !ctx.matches(section.slug)) {
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
    if (ctx.sectionsBySlug.has(slide.slug) || !ctx.matches(slide.slug)) {
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
      if (
        ctx.sectionsBySlug.has(file.slug) ||
        ctx.slidesBySlug.has(file.slug) ||
        !ctx.matches(file.slug)
      ) {
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

/** DEK016 for a slides/<slug>.js: motion is written in TypeScript. */
function javascriptDiagnostics(ctx: LintContext): Diagnostic[] {
  return listSlideFiles(ctx.deck.dir, ".js").flatMap((file) =>
    ctx.matches(file.slug)
      ? [
          diag("DEK016", {
            message: javascriptScriptProblem(file.slug),
            path: file.path,
            slug: file.slug,
            data: { file: `slides/${file.slug}.js` },
          }),
        ]
      : [],
  );
}

/** DEK016 and DEK017 from evaluating each slide script, by slug; one sandbox run for all of them. */
function slideScriptDiagnostics(ctx: LintContext): Map<string, Diagnostic[]> {
  const scripted = lintedSlideScripts(ctx.deck, ctx.only);
  const problems = slideScriptsProblems(scripted.map((entry) => entry.input));
  return new Map(
    scripted.map(({ section, path, input }, index) => [
      section.slug,
      [
        ...(problems[index] ?? []).map((message) =>
          diag("DEK016", {
            message,
            path,
            slug: section.slug,
            data: { file: `slides/${section.slug}.ts` },
          }),
        ),
        ...seekProblems(input.code).map((problem) =>
          diag("DEK017", { path, slug: section.slug, ...problem }),
        ),
      ],
    ]),
  );
}

/** Everything about one slide that has HTML: its stylesheet, its script, then its markup. */
function slideDiagnostics(
  ctx: LintContext,
  section: Section,
  scripts: Map<string, Diagnostic[]>,
): Diagnostic[] {
  const slide = ctx.slidesBySlug.get(section.slug);
  if (!slide || !ctx.matches(section.slug)) {
    return [];
  }
  const style = ctx.stylesBySlug.get(section.slug);
  const styleCss = style ? readFileSync(style.path, "utf8") : undefined;
  const html = readFileSync(slide.path, "utf8");
  return [
    ...(style && styleCss !== undefined
      ? lintSlideStyle(section.slug, style.path, styleCss, ctx.theme?.tokens ?? [], ctx.deck.dir)
      : []),
    ...(scripts.get(section.slug) ?? []),
    ...lintSlideHtml(section, slide.path, html, {
      deckDir: ctx.deck.dir,
      skeleton: html === skeletonHtml(ctx.deck.deck, section.slug),
      hasScript: scripts.has(section.slug),
      classes: ctx.theme && new Set([...ctx.theme.classes, ...cssClassNames(styleCss ?? "")]),
      // A theme with no layouts at all has nothing to check a data-layout against.
      ...(ctx.theme && ctx.theme.layouts.size > 0
        ? { layouts: new Set([...ctx.theme.layouts, ...cssLayoutNames(styleCss ?? "")]) }
        : {}),
    }),
  ];
}

/** DEK041 against the voice timeline when there is one, else against the reading-time estimate. */
function timingDiagnostics(ctx: LintContext): Diagnostic[] {
  const timeline = tryLoadCachedTimeline(ctx.deck.dir);
  return timeline ? lintDuration(ctx.deck, timeline) : lintEstimate(ctx.deck, ctx.config);
}

/** DEK042: a beat that shows a list, code, or table but has nothing to say. */
export function silentCueDiagnostics(deck: ProjectDeck, only?: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const cue of silentCues(deck.deck)) {
    if (only !== undefined && cue.slug !== only) {
      continue;
    }
    const section = deck.deck.sections[cue.position.slideIndex];
    const where =
      section && section.beats.length > 0
        ? `"${cue.slug}" beat ${cue.position.beatIndex + 1}`
        : `"${cue.slug}"`;
    diagnostics.push(
      diag("DEK042", {
        message: `no spoken paragraph in ${where}; lists, code, and tables are not synthesized`,
        path: deck.scriptPath,
        line: cue.line,
        slug: cue.slug,
      }),
    );
  }
  return diagnostics;
}

function lintVoice(deck: ProjectDeck, only?: string): Diagnostic[] {
  const dict = loadVoiceDict(deck.dir);
  const diagnostics: Diagnostic[] = silentCueDiagnostics(deck, only);
  if (only === undefined) {
    const voiceToml = join(voiceDir(deck.dir), "voice.toml");
    for (const key of resolveBeatTiming(deck.deck, loadVoiceSettings(deck.dir)).unknown) {
      diagnostics.push(
        diag("DEK043", {
          message: `voice.toml [beats."${key}"] matches no slide or beat`,
          path: voiceToml,
          data: { key },
        }),
      );
    }
  }
  for (const cue of cuesFromDeck(deck.deck)) {
    if (only !== undefined && cue.slug !== only) {
      continue;
    }
    for (const word of unknownAsciiWords(cue.paragraphs.join("\n"), dict)) {
      diagnostics.push(
        diag("DEK040", {
          message: `dictionary is missing English word: ${word} in "${cue.slug}"`,
          path: deck.scriptPath,
          line: cue.line,
          slug: cue.slug,
          data: { word },
        }),
      );
    }
  }
  return diagnostics;
}

function lintDuration(deck: ProjectDeck, timeline: Timeline): Diagnostic[] {
  const budget = parseDurationSeconds(deck.deck.duration);
  if (budget === undefined || budget <= 0) {
    return [];
  }
  const actual = timeline.durationMs / 1000;
  const drift = Math.abs(actual - budget) / budget;
  if (drift < DURATION_DRIFT_RATIO) {
    return [];
  }
  return [
    diag("DEK041", {
      message: `video duration ${Math.round(actual)}s differs from budget ${deck.deck.duration} by more than ${Math.round(DURATION_DRIFT_RATIO * 100)}%`,
      path: deck.scriptPath,
      hint: durationHint(actual < budget),
      data: { actualSeconds: Math.round(actual), budgetSeconds: budget, source: "timeline" },
    }),
  ];
}

/** DEK041 before any voice: the reading-time estimate `dek ls` shows, against the budget. */
function lintEstimate(deck: ProjectDeck, config: DekConfig): Diagnostic[] {
  const budget = parseDurationSeconds(deck.deck.duration);
  if (budget === undefined || budget <= 0) {
    return [];
  }
  const estimate = sectionTiming(deck.deck.sections, deck.deck.duration, config).reduce(
    (sum, row) => sum + row.estimateSeconds,
    0,
  );
  if (Math.abs(estimate - budget) / budget < ESTIMATE_DRIFT_RATIO) {
    return [];
  }
  return [
    diag("DEK041", {
      message: `the script reads in about ${formatClock(estimate)}, budget ${deck.deck.duration}; more than ${Math.round(ESTIMATE_DRIFT_RATIO * 100)}% apart`,
      path: deck.scriptPath,
      hint: durationHint(estimate < budget),
      data: { actualSeconds: estimate, budgetSeconds: budget, source: "estimate" },
    }),
  ];
}

function durationHint(short: boolean): string {
  return short
    ? "write more for the slot, or shorten duration in the frontmatter"
    : "cut the script, or lengthen duration in the frontmatter";
}

function uniqueSections(sections: Section[]): Section[] {
  const seen = new Set<string>();
  const unique: Section[] = [];
  for (const section of sections) {
    if (seen.has(section.slug)) {
      continue;
    }
    seen.add(section.slug);
    unique.push(section);
  }
  return unique;
}

/**
 * DEK018: no theme.css beside script.md. The deck would show unstyled, and
 * every theme rule (DEK010, DEK012 to DEK015) is silent until one exists.
 */
function missingThemeDiagnostic(ctx: LintContext): Diagnostic {
  return diag("DEK018", {
    message: "theme.css not found",
    path: join(ctx.deck.dir, "theme.css"),
    hint: "copy theme.css from the project root or another deck into the deck directory",
  });
}

function lintTheme(path: string, css: string, maxClasses: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const selector of topLevelSelectors(css)) {
    if (isScopedThemeSelector(selector)) {
      continue;
    }
    diagnostics.push(
      diag("DEK012", {
        message: `top-level selector "${selector}" must be scoped under .slide`,
        path,
        data: { selector },
      }),
    );
  }

  const classCount = cssClassNames(css).size;
  if (classCount > maxClasses) {
    diagnostics.push(
      diag("DEK013", {
        message: `theme.css has ${classCount} classes; limit is ${maxClasses}`,
        path,
        data: { classes: classCount, limit: maxClasses },
      }),
    );
  }

  const published = cssCustomProperties(css);
  for (const name of REQUIRED_TOKENS) {
    if (published.has(name)) {
      continue;
    }
    diagnostics.push(
      diag("DEK015", {
        message: `theme.css is missing required token "${name}"`,
        path,
        data: { token: name },
      }),
    );
  }

  diagnostics.push(...rawValueDiagnostics(css, path, cssTokenValues(css)));
  return diagnostics;
}

/** A slide's own stylesheet: tokens only, and nothing that reaches past the slide. */
function lintSlideStyle(
  slug: string,
  path: string,
  css: string,
  tokens: Array<{ name: string; value: string }>,
  deckDir: string,
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const selector of cssStyleSelectors(css)) {
    const parts = splitSelectorList(selector).map((part) => part.trim());
    const message = parts.some((part) => part.startsWith("::view-transition"))
      ? `"${selector}" applies to every slide; view transitions belong in theme.css`
      : parts.some((part) => PAGE_SELECTOR_RE.test(part))
        ? `"${selector}" never matches inside a slide; page-wide rules belong in theme.css`
        : undefined;
    if (message) {
      diagnostics.push(diag("DEK012", { message, path, slug, data: { selector } }));
    }
  }
  for (const name of cssAtRuleNames(css)) {
    if (name === "font-face" || name === "import") {
      diagnostics.push(
        diag("DEK012", {
          message: `@${name} applies to the whole deck; it belongs in theme.css`,
          path,
          slug,
          data: { atRule: name },
        }),
      );
    }
  }
  for (const url of cssUrls(css)) {
    diagnostics.push(
      ...assetRefDiagnostics(
        { value: url.value, use: "resource" },
        { path, line: url.line, slug, deckDir },
      ),
    );
  }
  diagnostics.push(...rawValueDiagnostics(css, path, [...tokens, ...cssTokenValues(css)], slug));
  return diagnostics;
}

/** DEK014 for theme.css and slide stylesheets alike: design values come from tokens. */
function rawValueDiagnostics(
  css: string,
  path: string,
  tokens: Array<{ name: string; value: string }>,
  slug?: string,
): Diagnostic[] {
  return cssDeclarations(css)
    .filter((decl) => isRawThemeValue(decl.property, decl.value))
    .map((decl) =>
      diag("DEK014", {
        message: `raw value in "${decl.property}: ${decl.value}"; use a theme token`,
        path,
        line: decl.line,
        hint: rawValueHint(decl.property, decl.value, tokens),
        data: { property: decl.property, value: decl.value },
        ...(slug === undefined ? {} : { slug }),
      }),
    );
}

/** Selectors that name the page, which a scoped slide rule can never reach. */
const PAGE_SELECTOR_RE = /^(:root|html|body)(?=$|[\s[.:#>+~])/;

/** One slide's markup, scanned once; every finding in it is located by the scan. */
type SlideHtml = {
  section: Section;
  path: string;
  scan: HtmlScan;
  /** Whether the file is still the skeleton `dek sync` wrote, which sync keeps in step. */
  skeleton: boolean;
};

function lintSlideHtml(
  section: Section,
  path: string,
  html: string,
  options: {
    deckDir: string;
    skeleton?: boolean;
    classes?: Set<string>;
    layouts?: Set<string>;
    hasScript?: boolean;
  },
): Diagnostic[] {
  const slide: SlideHtml = {
    section,
    path,
    scan: scanSlideHtml(html),
    skeleton: options.skeleton === true,
  };
  if (slide.scan.slides.length === 0) {
    return [missingSectionDiagnostic(slide)];
  }
  return [
    ...extraSectionDiagnostics(slide),
    ...(options.layouts ? layoutDiagnostics(slide, options.layouts) : []),
    ...slugDiagnostics(slide),
    ...stepDiagnostics(slide),
    ...morphDiagnostics(slide),
    ...inlineCodeDiagnostics(slide),
    ...emptyHeadingDiagnostics(slide),
    ...(options.classes
      ? unknownClassDiagnostics(slide, options.classes, options.hasScript === true)
      : []),
    ...slide.scan.refs.flatMap((ref) =>
      assetRefDiagnostics(ref, {
        path,
        ...spotOf(ref),
        slug: section.slug,
        deckDir: options.deckDir,
      }),
    ),
  ];
}

/** Every `name` attribute in the markup, in document order. */
function attributesNamed(scan: HtmlScan, name: string): HtmlAttribute[] {
  return scan.elements.flatMap((element) =>
    element.attributes.filter((attribute) => attribute.name === name),
  );
}

/** The location fields of a diagnostic, from wherever the scan found the thing. */
function spotOf({ line, column }: SourceSpot): { line: number; column: number } {
  return { line, column };
}

/** DEK007: the file is there, but nothing in it is a slide, so build and show draw nothing for it. */
function missingSectionDiagnostic({ section, path }: SlideHtml): Diagnostic {
  return diag("DEK007", {
    message: `slides/${section.slug}.html has no <section class="slide">`,
    path,
    slug: section.slug,
    hint: 'wrap the slide markup in <section class="slide">…</section>',
  });
}

/** DEK009: more than one slide in a file; the player shows the first and drops the rest. */
function extraSectionDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  const [, second] = scan.slides;
  if (!second) {
    return [];
  }
  return [
    diag("DEK009", {
      message: `slides/${section.slug}.html has ${scan.slides.length} <section class="slide">; only the first is shown`,
      path,
      ...spotOf(second),
      slug: section.slug,
      hint: "one file is one slide: add a ## section to script.md and move the rest into its file",
      data: { sections: scan.slides.length },
    }),
  ];
}

/** DEK019: a data-layout that neither the theme nor the slide's stylesheet lays out. */
function layoutDiagnostics({ section, path, scan }: SlideHtml, layouts: Set<string>): Diagnostic[] {
  const attribute = scan.slides[0]?.attributes.find((entry) => entry.name === "data-layout");
  if (scan.layout === undefined || !attribute || layouts.has(scan.layout)) {
    return [];
  }
  const known = [...layouts].sort();
  const guess = suggest(scan.layout, known);
  return [
    diag("DEK019", {
      message: `data-layout "${scan.layout}" is not a layout of the theme`,
      path,
      ...spotOf(attribute),
      slug: section.slug,
      hint: `${guess ? `did you mean ${guess}? ` : ""}run \`dek theme\` to see the layouts`,
      data: { layout: scan.layout, layouts: known },
    }),
  ];
}

/**
 * DEK044: a `#` or `####` heading. Only `##` (slide) and `###` (beat) mean anything, so any
 * other level is read out as part of the script, `#` and all.
 */
function strayHeadingDiagnostics(ctx: LintContext): Diagnostic[] {
  const { deck } = ctx;
  const lines = splitLines(readTextIfExists(deck.scriptPath) ?? "");
  const starts = deck.deck.sections.map((section) => ({ line: section.line, slug: section.slug }));
  const diagnostics: Diagnostic[] = [];
  let fence: string | undefined;
  let body = false;
  let dashes = 0;
  for (const [index, text] of lines.entries()) {
    if (!body) {
      dashes += text.trim() === "---" ? 1 : 0;
      body = dashes >= 2;
      continue;
    }
    const marker = text.match(/^\s*(`{3,}|~{3,})/)?.[1];
    if (marker) {
      fence = fence === undefined ? marker : text.trim().startsWith(fence) ? undefined : fence;
      continue;
    }
    const level = fence === undefined ? text.match(/^(#{1,6})\s/)?.[1]?.length : undefined;
    if (level === undefined || level === 2 || level === 3) {
      continue;
    }
    const line = index + 1;
    const slug = starts.filter((start) => start.line < line).at(-1)?.slug;
    if (slug !== undefined ? !ctx.matches(slug) : ctx.only !== undefined) {
      continue;
    }
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

/**
 * Decks copy what they use from the project's `assets/` (so a deck stays whole when moved);
 * when the project has the file, the fix is that copy.
 */
function missingImageHint(value: string, deckDir: string): { hint?: string } {
  const name = value.trim().split(/[?#]/)[0] ?? "";
  if (!name.startsWith("assets/")) {
    return {};
  }
  const projectFile = join(dirname(dirname(deckDir)), name);
  if (!existsSync(projectFile)) {
    return {};
  }
  return { hint: `the project has it: copy ../../${name} into the deck's assets/` };
}

/** DEK006: the slide's data-slug names another section. */
function slugDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  const found = scan.slides
    .flatMap((element) => element.attributes)
    .find((attribute) => attribute.name === "data-slug");
  if (!found || found.value === section.slug) {
    return [];
  }
  return [
    diag("DEK006", {
      message: `data-slug "${found.value}" does not match section "${section.slug}"`,
      path,
      ...spotOf(found),
      slug: section.slug,
      data: { slug: found.value, expected: section.slug },
    }),
  ];
}

/**
 * DEK003: a data-step that is neither a beat id nor a beat index. DEK025: a beat index where
 * that beat has an id, which silently binds the next beat over once one is inserted before it.
 */
function stepDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  return attributesNamed(scan, "data-step").flatMap((attribute) => {
    const step = attribute.value;
    if (!resolvesStep(step, section.beats)) {
      return [
        diag("DEK003", {
          message: `data-step "${step}" is not a beat id or index in "${section.slug}"`,
          path,
          ...spotOf(attribute),
          slug: section.slug,
          hint: stepHint(section),
          data: { step, choices: stepChoices(section.beats) },
        }),
      ];
    }
    const id = POSITIVE_INT_RE.test(step) ? section.beats[Number(step) - 1]?.id : undefined;
    if (id === undefined) {
      return [];
    }
    return [
      diag("DEK025", {
        message: `data-step "${step}" is beat "${id}" by position; it moves if a beat is inserted before it`,
        path,
        ...spotOf(attribute),
        slug: section.slug,
        hint: `use data-step="${id}"`,
        data: { step, id },
      }),
    ];
  });
}

/** DEK005: a data-morph used twice, or one the player or CSS already means something by. */
function morphDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const first = new Map<string, HtmlAttribute>();
  const reported = new Set<string>();
  for (const attribute of attributesNamed(scan, "data-morph")) {
    const morph = attribute.value;
    if (!first.has(morph)) {
      first.set(morph, attribute);
      continue;
    }
    if (reported.has(morph)) {
      continue;
    }
    reported.add(morph);
    diagnostics.push(
      diag("DEK005", {
        message: `duplicate data-morph "${morph}"`,
        path,
        ...spotOf(attribute),
        slug: section.slug,
        data: { morph },
      }),
    );
  }
  for (const [morph, attribute] of first) {
    if (!RESERVED_MORPHS.has(morph)) {
      continue;
    }
    diagnostics.push(
      diag("DEK005", {
        message: `data-morph "${morph}" is reserved`,
        path,
        ...spotOf(attribute),
        slug: section.slug,
        hint: `rename it; the player uses "slide" and "root" for the page itself, and "none", "auto", and "match-element" are CSS keywords`,
        data: { morph },
      }),
    );
  }
  return diagnostics;
}

/**
 * DEK011: style or script inside the markup, which belongs in the slide's own .css or .ts. Every
 * occurrence is its own finding: a `<style>` or `<script>` element, a `style` attribute, an event
 * handler attribute, and a `javascript:` URL.
 */
function inlineCodeDiagnostics({ section, path, scan }: SlideHtml): Diagnostic[] {
  return scan.elements
    .flatMap((element) => [
      {
        spot: element as SourceSpot,
        found: inlineElement(element.tag, section.slug),
        data: { kind: "element", name: element.tag },
      },
      ...element.attributes.map((attribute) => ({
        spot: attribute as SourceSpot,
        found: inlineAttribute(element.tag, attribute, section.slug),
        data: { kind: "attribute", name: attribute.name, value: attribute.value },
      })),
    ])
    .flatMap(({ spot, found, data }) =>
      found
        ? [
            diag("DEK011", {
              message: found.message,
              path,
              ...spotOf(spot),
              slug: section.slug,
              hint: found.hint,
              data,
            }),
          ]
        : [],
    );
}

type InlineCode = { message: string; hint: string };

function inlineElement(tag: string, slug: string): InlineCode | undefined {
  if (tag === "style") {
    return {
      message: "slide contains a <style> element",
      hint: `move the rules to slides/${slug}.css`,
    };
  }
  if (tag === "script") {
    return { message: "slide contains a <script> element", hint: motionHint(slug) };
  }
  return undefined;
}

function inlineAttribute(
  tag: string,
  attribute: HtmlAttribute,
  slug: string,
): InlineCode | undefined {
  if (attribute.name === "style") {
    return {
      message: "slide contains a style attribute",
      hint: `move it to a class in slides/${slug}.css, using token var()`,
    };
  }
  if (EVENT_HANDLER_RE.test(attribute.name)) {
    return {
      message: `slide contains an ${attribute.name} attribute`,
      hint: `remove it; a slide takes no input, and motion goes in slides/${slug}.ts as a draw(t) function`,
    };
  }
  if (isUrlAttribute(tag, attribute.name) && isJavascriptUrl(attribute.value)) {
    return { message: "slide contains a javascript: URL", hint: motionHint(slug) };
  }
  return undefined;
}

function motionHint(slug: string): string {
  return `move motion to slides/${slug}.ts as a draw(t) function`;
}

/** `onclick`, `onload`, and every other attribute the browser runs as script. */
const EVENT_HANDLER_RE = /^on[a-z]+$/;
/** Read the way the URL parser reads it: tabs and newlines dropped, leading space trimmed, any case. */
function isJavascriptUrl(value: string): boolean {
  return value
    .replace(/[\t\n\r]/g, "")
    .trimStart()
    .toLowerCase()
    .startsWith("javascript:");
}

/**
 * DEK024: a heading with nothing in it, which the audience sees as a gap where a title should
 * be. An id-only `##` heading after the first slide makes one: sync never puts the id on a slide.
 */
function emptyHeadingDiagnostics({ section, path, scan, skeleton }: SlideHtml): Diagnostic[] {
  const hint = skeleton
    ? `give the slide a title in script.md, like \`## Your title {#${section.slug}}\`, then run \`dek sync\``
    : `write the heading's text in slides/${section.slug}.html, or remove the element`;
  return scan.emptyHeadings.map((element) =>
    diag("DEK024", {
      message: `<${element.tag}> is empty, so the slide shows no heading`,
      path,
      ...spotOf(element),
      slug: section.slug,
      hint,
      data: { tag: element.tag },
    }),
  );
}

/** DEK010: a class neither theme.css nor the slide's own stylesheet defines. */
function unknownClassDiagnostics(
  { section, path, scan }: SlideHtml,
  classes: Set<string>,
  hasScript: boolean,
): Diagnostic[] {
  const known = [...classes].sort();
  const shown =
    known.length > MAX_HINT_CLASSES ? [...known.slice(0, MAX_HINT_CLASSES), "…"] : known;
  const scriptHint = hasScript
    ? `; to find an element from slides/${section.slug}.ts, use a data-* attribute instead`
    : "";
  const hint = `define it in slides/${section.slug}.css, or use one of: ${shown.join(", ")}${scriptHint}`;
  const unknown = new Map<string, HtmlAttribute>();
  for (const attribute of attributesNamed(scan, "class")) {
    for (const name of attribute.value.split(/\s+/).filter(Boolean)) {
      if (!classes.has(name) && !unknown.has(name)) {
        unknown.set(name, attribute);
      }
    }
  }
  return [...unknown].map(([name, attribute]) => {
    const suggestion = suggest(name, known);
    return diag("DEK010", {
      message: `class "${name}" is not defined in theme.css`,
      path,
      ...spotOf(attribute),
      slug: section.slug,
      hint: suggestion ? `did you mean ${suggestion}? ${hint}` : hint,
      data: { class: name, ...(suggestion ? { suggestion } : {}) },
    });
  });
}

/**
 * DEK020 to DEK023 for one reference, whether it comes from a slide's markup
 * or a stylesheet's `url()`. A resource the page loads must exist and be written
 * as `assets/...`; a link must only stay local and inside the deck.
 */
function assetRefDiagnostics(
  ref: Pick<HtmlRef, "value" | "use"> & { tag?: string },
  where: { path: string; line?: number; column?: number; slug: string; deckDir: string },
): Diagnostic[] {
  const { deckDir, ...location } = where;
  const kind = classifyAssetRef(ref.value, { deckDir, from: dirname(where.path) }).kind;
  if (kind === "skip") {
    return [];
  }
  if (kind === "remote") {
    return [
      diag("DEK020", {
        message: `remote URL "${ref.value}"`,
        ...location,
        hint: remoteHint(ref.value),
        data: { url: ref.value },
      }),
    ];
  }
  if (kind === "escape") {
    return [
      diag("DEK022", {
        message: `path "${ref.value}" is outside the deck directory`,
        ...location,
        data: { path: ref.value },
      }),
    ];
  }
  if (ref.use === "link") {
    return [];
  }
  if (kind === "missing") {
    return [
      diag("DEK021", {
        message: `missing ${ref.tag === "img" ? "image" : "file"} "${ref.value}"`,
        ...location,
        ...missingImageHint(ref.value, deckDir),
        data: { src: ref.value },
      }),
    ];
  }
  if (!isCanonicalAssetPath(ref.value)) {
    return [
      diag("DEK023", {
        message: `asset "${ref.value}" must be referenced as assets/${posix.basename(ref.value.trim())}`,
        ...location,
        data: { src: ref.value },
      }),
    ];
  }
  return [];
}

const MAX_HINT_CLASSES = 20;

function stepHint(section: Section): string {
  if (section.beats.length === 0) {
    return `add a ### beat under "## ${section.title}" in script.md, or drop data-step`;
  }
  return formatStepChoices(stepChoices(section.beats));
}

function remoteHint(value: string): string {
  let name = "";
  try {
    name = posix.basename(new URL(value.trim(), "https://dek.invalid").pathname);
  } catch {}
  return name
    ? `download it into assets/ and use assets/${name}`
    : "download it into assets/ and reference it from there";
}

function resolvesStep(value: string, beats: Beat[]): boolean {
  if (POSITIVE_INT_RE.test(value)) {
    return Number(value) <= beats.length;
  }
  return beats.some((beat) => beat.id === value);
}

/**
 * One orphaned HTML file and one section without its own HTML look like a
 * heading renamed in script.md first. The section either has no HTML yet, or
 * only the skeleton the dev server generated on save. `dek mv` handles both,
 * so both diagnostics get that hint.
 */
function suggestRename(
  diagnostics: Diagnostic[],
  deck: ProjectDeck,
  htmlBySlug: Map<string, { path: string }>,
): Diagnostic[] {
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
      : deck.deck.sections
          .filter((section) => {
            const slide = htmlBySlug.get(section.slug);
            return (
              slide && readFileSync(slide.path, "utf8") === skeletonHtml(deck.deck, section.slug)
            );
          })
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
