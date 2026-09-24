import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { loadConfig } from "./config.ts";
import {
  cssAtRuleNames,
  cssClassNames,
  cssCustomProperties,
  cssDeclarations,
  cssStyleSelectors,
  cssTokenValues,
  cssUrls,
  isScopedThemeSelector,
  splitSelectorList,
  topLevelSelectors,
} from "./css.ts";
import { cuesFromDeck, silentCues, unknownAsciiWords } from "./cue.ts";
import type { Diagnostic } from "./diagnostic.ts";
import { consumeTransform, hasSlideClass } from "./html.ts";
import { isInside } from "./path.ts";
import {
  asResolvedDeck,
  listSlideFiles,
  listSlides,
  type Project,
  type ProjectDeck,
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
export const ESTIMATE_DRIFT_RATIO = 0.35;

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
  const only = options?.slug;
  const matches = (slug: string): boolean => only === undefined || only === slug;
  const config = loadConfig(project.configPath);
  const diagnostics: Diagnostic[] = [];
  const scriptPath = deck.scriptPath;
  const sections = deck.deck.sections;

  const seenSlugs = new Map<string, Section>();
  for (const section of sections) {
    const previous = seenSlugs.get(section.slug);
    if (previous) {
      if (matches(section.slug)) {
        diagnostics.push({
          id: "DEK004",
          message: `duplicate section id "${section.slug}"`,
          path: scriptPath,
          line: section.line,
          slug: section.slug,
        });
      }
    } else {
      seenSlugs.set(section.slug, section);
    }

    const seenBeats = new Map<string, Beat>();
    for (const beat of section.beats) {
      if (!beat.id) {
        continue;
      }
      const previousBeat = seenBeats.get(beat.id);
      if (previousBeat) {
        if (matches(section.slug)) {
          diagnostics.push({
            id: "DEK004",
            message: `duplicate beat id "${beat.id}" in "${section.slug}"`,
            path: scriptPath,
            line: beat.line,
            slug: section.slug,
          });
        }
      } else {
        seenBeats.set(beat.id, beat);
      }
    }
  }

  const slides = listSlides(deck.dir);
  const htmlBySlug = new Map(slides.map((slide) => [slide.slug, slide]));

  for (const section of sections) {
    if (htmlBySlug.has(section.slug) || !matches(section.slug)) {
      continue;
    }
    diagnostics.push({
      id: "DEK001",
      message: `missing slide HTML for "${section.slug}"`,
      path: scriptPath,
      line: section.line,
      slug: section.slug,
      hint: "run `dek sync` to create the skeleton",
      data: { expected: `slides/${section.slug}.html` },
    });
  }

  for (const slide of slides) {
    if (seenSlugs.has(slide.slug) || !matches(slide.slug)) {
      continue;
    }
    diagnostics.push({
      id: "DEK002",
      message: `slide HTML has no section "${slide.slug}"`,
      path: slide.path,
      slug: slide.slug,
    });
  }

  const sidecars = new Map(SLIDE_SIDECARS.map((ext) => [ext, listSlideFiles(deck.dir, ext)]));
  const styleBySlug = new Map((sidecars.get(".css") ?? []).map((file) => [file.slug, file]));
  for (const [ext, files] of sidecars) {
    const kind = ext === ".css" ? "stylesheet" : "script";
    for (const file of files) {
      // A sidecar next to an orphaned HTML file travels with it; DEK002 already names the slug.
      if (seenSlugs.has(file.slug) || htmlBySlug.has(file.slug) || !matches(file.slug)) {
        continue;
      }
      diagnostics.push({
        id: "DEK002",
        message: `slide ${kind} has no section "${file.slug}"`,
        path: file.path,
        slug: file.slug,
      });
    }
  }

  for (const file of listSlideFiles(deck.dir, ".js")) {
    if (matches(file.slug)) {
      diagnostics.push({
        id: "DEK016",
        message: javascriptScriptProblem(file.slug),
        path: file.path,
        slug: file.slug,
      });
    }
  }

  // One evaluation for every script, so lint starts the sandbox once.
  const scripted = lintedSlideScripts(deck, only);
  const scriptProblems = slideScriptsProblems(scripted.map((entry) => entry.input));
  const scriptDiagnostics = new Map(
    scripted.map(({ section, path, input }, index) => [
      section.slug,
      [
        ...(scriptProblems[index] ?? []).map(
          (message): Diagnostic => ({ id: "DEK016", message, path, slug: section.slug }),
        ),
        ...seekProblems(input.code).map(
          (problem): Diagnostic => ({ id: "DEK017", path, slug: section.slug, ...problem }),
        ),
      ],
    ]),
  );

  const themePath = join(deck.dir, "theme.css");
  const theme = existsSync(themePath) ? readFileSync(themePath, "utf8") : undefined;
  const themeClasses = theme === undefined ? undefined : cssClassNames(theme);
  if (theme !== undefined) {
    diagnostics.push(...lintTheme(themePath, theme, config.maxClasses));
  }

  for (const section of uniqueSections(sections)) {
    if (!matches(section.slug)) {
      continue;
    }
    const slide = htmlBySlug.get(section.slug);
    if (!slide) {
      continue;
    }
    const html = readFileSync(slide.path, "utf8");
    const style = styleBySlug.get(section.slug);
    const styleCss = style ? readFileSync(style.path, "utf8") : undefined;
    if (style && styleCss !== undefined) {
      diagnostics.push(
        ...lintSlideStyle(section.slug, style.path, styleCss, cssTokenValues(theme ?? "")),
      );
    }
    diagnostics.push(...(scriptDiagnostics.get(section.slug) ?? []));
    diagnostics.push(
      ...lintSlideHtml(section, slide.path, html, {
        deckDir: deck.dir,
        hasScript: scriptDiagnostics.has(section.slug),
        classes: themeClasses && new Set([...themeClasses, ...cssClassNames(styleCss ?? "")]),
      }),
    );
  }

  suggestRename(diagnostics, deck, htmlBySlug);
  if (hasVoice(deck.dir)) {
    diagnostics.push(...lintVoice(deck, only));
  }
  const timeline = tryLoadCachedTimeline(deck.dir);
  diagnostics.push(...(timeline ? lintDuration(deck, timeline) : lintEstimate(deck, config)));
  return diagnostics;
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
    diagnostics.push({
      id: "DEK042",
      message: `no spoken paragraph in ${where}; lists, code, and tables are not synthesized`,
      path: deck.scriptPath,
      line: cue.line,
      slug: cue.slug,
    });
  }
  return diagnostics;
}

function lintVoice(deck: ProjectDeck, only?: string): Diagnostic[] {
  const dict = loadVoiceDict(deck.dir);
  const diagnostics: Diagnostic[] = silentCueDiagnostics(deck, only);
  if (only === undefined) {
    const voiceToml = join(voiceDir(deck.dir), "voice.toml");
    for (const key of resolveBeatTiming(deck.deck, loadVoiceSettings(deck.dir)).unknown) {
      diagnostics.push({
        id: "DEK043",
        message: `voice.toml [beats."${key}"] matches no slide or beat`,
        path: voiceToml,
      });
    }
  }
  for (const cue of cuesFromDeck(deck.deck)) {
    if (only !== undefined && cue.slug !== only) {
      continue;
    }
    for (const word of unknownAsciiWords(cue.paragraphs.join("\n"), dict)) {
      diagnostics.push({
        id: "DEK040",
        message: `dictionary is missing English word: ${word} in "${cue.slug}"`,
        path: deck.scriptPath,
        line: cue.line,
        slug: cue.slug,
        data: { word },
      });
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
    {
      id: "DEK041",
      message: `video duration ${Math.round(actual)}s differs from budget ${deck.deck.duration} by more than ${Math.round(DURATION_DRIFT_RATIO * 100)}%`,
      path: deck.scriptPath,
      hint: durationHint(actual < budget),
      data: { videoSeconds: Math.round(actual), budgetSeconds: budget },
    },
  ];
}

/** DEK041 before any voice: the reading-time estimate `dek ls` shows, against the budget. */
function lintEstimate(deck: ProjectDeck, config: ReturnType<typeof loadConfig>): Diagnostic[] {
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
    {
      id: "DEK041",
      message: `the script reads in about ${formatClock(estimate)}, budget ${deck.deck.duration}; more than ${Math.round(ESTIMATE_DRIFT_RATIO * 100)}% apart`,
      path: deck.scriptPath,
      hint: durationHint(estimate < budget),
      data: { estimateSeconds: estimate, budgetSeconds: budget },
    },
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

function lintTheme(path: string, css: string, maxClasses: number): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const selector of topLevelSelectors(css)) {
    if (isScopedThemeSelector(selector)) {
      continue;
    }
    diagnostics.push({
      id: "DEK012",
      message: `top-level selector "${selector}" must be scoped under .slide`,
      path,
    });
  }

  const classCount = cssClassNames(css).size;
  if (classCount > maxClasses) {
    diagnostics.push({
      id: "DEK013",
      message: `theme.css has ${classCount} classes; limit is ${maxClasses}`,
      path,
    });
  }

  const published = cssCustomProperties(css);
  for (const name of REQUIRED_TOKENS) {
    if (published.has(name)) {
      continue;
    }
    diagnostics.push({
      id: "DEK015",
      message: `theme.css is missing required token "${name}"`,
      path,
    });
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
      diagnostics.push({ id: "DEK012", message, path, slug });
    }
  }
  for (const name of cssAtRuleNames(css)) {
    if (name === "font-face" || name === "import") {
      diagnostics.push({
        id: "DEK012",
        message: `@${name} applies to the whole deck; it belongs in theme.css`,
        path,
        slug,
      });
    }
  }
  for (const url of cssUrls(css)) {
    if (/^(https?:)?\/\//i.test(url.value)) {
      diagnostics.push({
        id: "DEK020",
        message: `remote URL "${url.value}"`,
        path,
        line: url.line,
        slug,
        data: { url: url.value },
      });
    } else if (!isCanonicalAssetSrc(url.value)) {
      diagnostics.push({
        id: "DEK023",
        message: `asset "${url.value}" must be referenced as assets/${posix.basename(url.value)}`,
        path,
        line: url.line,
        slug,
        data: { src: url.value },
      });
    }
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
    .map((decl) => ({
      id: "DEK014",
      message: `raw value in "${decl.property}: ${decl.value}"; use a theme token`,
      path,
      line: decl.line,
      hint: rawValueHint(decl.property, decl.value, tokens),
      data: { property: decl.property, value: decl.value },
      ...(slug === undefined ? {} : { slug }),
    }));
}

/** Selectors that name the page, which a scoped slide rule can never reach. */
const PAGE_SELECTOR_RE = /^(:root|html|body)(?=$|[\s[.:#>+~])/;

function lintSlideHtml(
  section: Section,
  path: string,
  html: string,
  options: { deckDir: string; classes?: Set<string>; hasScript?: boolean },
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const scan = scanSlideHtml(html);
  const at = (pattern: RegExp, nth = 1): { line?: number } => {
    const line = lineOf(html, pattern, nth);
    return line === undefined ? {} : { line };
  };

  if (scan.slug !== undefined && scan.slug !== section.slug) {
    diagnostics.push({
      id: "DEK006",
      message: `data-slug "${scan.slug}" does not match section "${section.slug}"`,
      path,
      ...at(attributePattern("data-slug", scan.slug)),
      slug: section.slug,
    });
  }

  for (const step of scan.steps) {
    if (resolvesStep(step, section.beats)) {
      continue;
    }
    diagnostics.push({
      id: "DEK003",
      message: `data-step "${step}" is not a beat id or index in "${section.slug}"`,
      path,
      ...at(attributePattern("data-step", step)),
      slug: section.slug,
      hint: stepHint(section),
      data: { step, choices: stepChoices(section.beats) },
    });
  }

  const seenMorphs = new Set<string>();
  const duplicateMorphs = new Set<string>();
  for (const morph of scan.morphs) {
    if (seenMorphs.has(morph)) {
      duplicateMorphs.add(morph);
    } else {
      seenMorphs.add(morph);
    }
  }
  for (const morph of duplicateMorphs) {
    diagnostics.push({
      id: "DEK005",
      message: `duplicate data-morph "${morph}"`,
      path,
      ...at(attributePattern("data-morph", morph), 2),
      slug: section.slug,
      data: { morph },
    });
  }
  for (const morph of seenMorphs) {
    if (!RESERVED_MORPHS.has(morph)) {
      continue;
    }
    diagnostics.push({
      id: "DEK005",
      message: `data-morph "${morph}" is reserved`,
      path,
      ...at(attributePattern("data-morph", morph)),
      slug: section.slug,
      hint: `rename it; the player uses "slide" and "root" for the page itself, and "none", "auto", and "match-element" are CSS keywords`,
      data: { morph },
    });
  }

  if (scan.styleElements) {
    diagnostics.push({
      id: "DEK011",
      message: "slide contains a <style> element",
      path,
      ...at(/<style[\s>]/i),
      slug: section.slug,
      hint: `move the rules to slides/${section.slug}.css`,
    });
  }
  if (scan.styleAttributes) {
    diagnostics.push({
      id: "DEK011",
      message: "slide contains a style attribute",
      path,
      ...at(/\sstyle\s*=/i),
      slug: section.slug,
      hint: `move it to a class in slides/${section.slug}.css, using token var()`,
    });
  }
  if (scan.scriptElements) {
    diagnostics.push({
      id: "DEK011",
      message: "slide contains a <script> element",
      path,
      ...at(/<script[\s>]/i),
      slug: section.slug,
      hint: `move motion to slides/${section.slug}.ts as a draw(t) function`,
    });
  }

  if (options.classes) {
    const known = [...options.classes].sort();
    const shown =
      known.length > MAX_HINT_CLASSES ? [...known.slice(0, MAX_HINT_CLASSES), "…"] : known;
    const scriptHint = options.hasScript
      ? `; to find an element from slides/${section.slug}.ts, use a data-* attribute instead`
      : "";
    const classHint = `define it in slides/${section.slug}.css, or use one of: ${shown.join(", ")}${scriptHint}`;
    const unknown = new Set<string>();
    for (const name of scan.classes) {
      if (!options.classes.has(name)) {
        unknown.add(name);
      }
    }
    for (const name of unknown) {
      diagnostics.push({
        id: "DEK010",
        message: `class "${name}" is not defined in theme.css`,
        path,
        ...at(classPattern(name)),
        hint: classHint,
        data: { class: name },
      });
    }
  }

  for (const ref of scan.refs) {
    const kind = classifyRef(ref, path, options.deckDir);
    const where = at(attributePattern(ref.attr, ref.value));
    if (kind === "remote") {
      diagnostics.push({
        id: "DEK020",
        message: `remote URL "${ref.value}"`,
        path,
        ...where,
        hint: remoteHint(ref.value),
        data: { url: ref.value },
      });
    } else if (kind === "escape") {
      diagnostics.push({
        id: "DEK022",
        message: `path "${ref.value}" is outside the deck directory`,
        path,
        ...where,
        data: { path: ref.value },
      });
    } else if (kind === "missing") {
      diagnostics.push({
        id: "DEK021",
        message: `missing image "${ref.value}"`,
        path,
        ...where,
        data: { src: ref.value },
      });
    } else if (kind === "ok" && ref.attr === "src" && !isCanonicalAssetSrc(ref.value)) {
      diagnostics.push({
        id: "DEK023",
        message: `asset "${ref.value}" must be referenced as assets/${posix.basename(ref.value.trim())}`,
        path,
        ...where,
        slug: section.slug,
        data: { src: ref.value },
      });
    }
  }

  return diagnostics;
}

const MAX_HINT_CLASSES = 20;

/** 1-based line of the `nth` match of `pattern` in `source`. */
function lineOf(source: string, pattern: RegExp, nth = 1): number | undefined {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  let seen = 0;
  for (const match of source.matchAll(new RegExp(pattern.source, flags))) {
    seen += 1;
    if (seen === nth) {
      return source.slice(0, match.index).split("\n").length;
    }
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** `name="value"`, `name='value'`, or unquoted `name=value`. */
function attributePattern(name: string, value: string): RegExp {
  const v = escapeRegExp(value);
  return new RegExp(`\\s${escapeRegExp(name)}\\s*=\\s*(?:"${v}"|'${v}'|${v}(?=[\\s/>]))`, "i");
}

/** A `class` attribute that lists `name` as one of its classes. */
function classPattern(name: string): RegExp {
  const n = escapeRegExp(name);
  return new RegExp(
    `\\sclass\\s*=\\s*(?:"(?:[^"]*\\s)?${n}(?:\\s[^"]*)?"|'(?:[^']*\\s)?${n}(?:\\s[^']*)?'|${n}(?=[\\s/>]))`,
    "i",
  );
}

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

type HtmlScan = {
  slug?: string;
  classes: string[];
  steps: string[];
  morphs: string[];
  styleElements: boolean;
  styleAttributes: boolean;
  scriptElements: boolean;
  refs: Array<{ tag: string; attr: string; value: string }>;
};

function scanSlideHtml(html: string): HtmlScan {
  const scan: HtmlScan = {
    classes: [],
    steps: [],
    morphs: [],
    styleElements: false,
    styleAttributes: false,
    scriptElements: false,
    refs: [],
  };

  const transformed = new HTMLRewriter()
    .on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        const className = el.getAttribute("class");
        if (tag === "section" && scan.slug === undefined) {
          if (hasSlideClass(className)) {
            const slug = el.getAttribute("data-slug");
            if (slug !== null) {
              scan.slug = slug;
            }
          }
        }
        if (className) {
          scan.classes.push(...className.split(/\s+/).filter(Boolean));
        }
        const step = el.getAttribute("data-step");
        if (step !== null) {
          scan.steps.push(step);
        }
        const morph = el.getAttribute("data-morph");
        if (morph !== null) {
          scan.morphs.push(morph);
        }
        if (el.getAttribute("style") !== null) {
          scan.styleAttributes = true;
        }
        if (tag === "style") {
          scan.styleElements = true;
        }
        if (tag === "script") {
          scan.scriptElements = true;
        }
        for (const attr of ["src", "href"]) {
          const value = el.getAttribute(attr);
          if (value) {
            scan.refs.push({ tag, attr, value });
          }
        }
      },
    })
    .transform(html);
  consumeTransform(transformed);
  return scan;
}

function classifyRef(
  ref: { tag: string; attr: string; value: string },
  slidePath: string,
  deckDir: string,
): "remote" | "escape" | "missing" | "ok" {
  const value = ref.value.trim();
  if (!value || value.startsWith("#") || value.startsWith("data:")) {
    return "ok";
  }
  if (/^(https?:)?\/\//i.test(value)) {
    return "remote";
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return "ok";
  }

  const candidates = [resolve(dirname(slidePath), value), resolve(deckDir, value)];
  const inside = candidates.filter((candidate) => isInside(candidate, deckDir));
  if (inside.length === 0) {
    return "escape";
  }
  if (inside.some((candidate) => existsSync(candidate))) {
    return "ok";
  }
  if (ref.tag === "img") {
    return "missing";
  }
  return "ok";
}

function isCanonicalAssetSrc(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("data:")) {
    return true;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    return true;
  }
  return trimmed.startsWith("assets/");
}

/**
 * One orphaned HTML file and one section without its own HTML look like a
 * heading renamed in script.md first. The section either has no HTML yet, or
 * only the skeleton the dev server generated on save. `dek mv` handles both.
 */
function suggestRename(
  diagnostics: Diagnostic[],
  deck: ProjectDeck,
  htmlBySlug: Map<string, { path: string }>,
): void {
  const orphans = diagnostics.filter(
    (diagnostic) => diagnostic.id === "DEK002" && diagnostic.path?.endsWith(".html"),
  );
  const [orphan] = orphans;
  if (orphans.length !== 1 || !orphan?.slug) {
    return;
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
    return;
  }
  const hint = `run \`dek mv ${orphan.slug} ${target}\``;
  orphan.hint = hint;
  for (const diagnostic of missing) {
    diagnostic.hint = hint;
  }
}
