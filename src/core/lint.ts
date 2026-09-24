import { existsSync, readFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { loadConfig } from "./config.ts";
import {
  cssAtRuleNames,
  cssClassNames,
  cssCustomProperties,
  cssDeclarations,
  cssStyleSelectors,
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
import { javascriptScriptProblem, slideScriptsProblems, warmSlideScripts } from "./slide-script.ts";
import { stepKey } from "./step.ts";
import type { Timeline } from "./timeline.ts";
import { parseDurationSeconds } from "./timing.ts";
import { isRawThemeValue, REQUIRED_TOKENS } from "./tokens.ts";
import {
  hasVoice,
  loadVoiceDict,
  loadVoiceSettings,
  resolveBeatTiming,
  tryLoadCachedTimeline,
  voiceDir,
} from "./voice.ts";

export const DURATION_DRIFT_RATIO = 0.2;

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
      path: join(deck.dir, "slides", `${section.slug}.html`),
      line: section.line,
      slug: section.slug,
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
    scripted.map(({ section, path }, index) => [
      section.slug,
      (scriptProblems[index] ?? []).map(
        (message): Diagnostic => ({ id: "DEK016", message, path, slug: section.slug }),
      ),
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
      diagnostics.push(...lintSlideStyle(section.slug, style.path, styleCss));
    }
    diagnostics.push(...(scriptDiagnostics.get(section.slug) ?? []));
    diagnostics.push(
      ...lintSlideHtml(section, slide.path, html, {
        deckDir: deck.dir,
        classes: themeClasses && new Set([...themeClasses, ...cssClassNames(styleCss ?? "")]),
      }),
    );
  }

  suggestRename(diagnostics);
  if (hasVoice(deck.dir)) {
    diagnostics.push(...lintVoice(deck, only));
  }
  const timeline = tryLoadCachedTimeline(deck.dir);
  if (timeline) {
    diagnostics.push(...lintDuration(deck, timeline));
  }
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
    },
  ];
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

  diagnostics.push(...rawValueDiagnostics(css, path));
  return diagnostics;
}

/** A slide's own stylesheet: tokens only, and nothing that reaches past the slide. */
function lintSlideStyle(slug: string, path: string, css: string): Diagnostic[] {
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
      });
    } else if (!isCanonicalAssetSrc(url.value)) {
      diagnostics.push({
        id: "DEK023",
        message: `asset "${url.value}" must be referenced as assets/${posix.basename(url.value)}`,
        path,
        line: url.line,
        slug,
      });
    }
  }
  diagnostics.push(...rawValueDiagnostics(css, path, slug));
  return diagnostics;
}

/** DEK014 for theme.css and slide stylesheets alike: design values come from tokens. */
function rawValueDiagnostics(css: string, path: string, slug?: string): Diagnostic[] {
  return cssDeclarations(css)
    .filter((decl) => isRawThemeValue(decl.property, decl.value))
    .map((decl) => ({
      id: "DEK014",
      message: `raw value in "${decl.property}: ${decl.value}"; use a theme token`,
      path,
      line: decl.line,
      ...(slug === undefined ? {} : { slug }),
    }));
}

/** Selectors that name the page, which a scoped slide rule can never reach. */
const PAGE_SELECTOR_RE = /^(:root|html|body)(?=$|[\s[.:#>+~])/;

function lintSlideHtml(
  section: Section,
  path: string,
  html: string,
  options: { deckDir: string; classes?: Set<string> },
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const scan = scanSlideHtml(html);

  if (scan.slug !== undefined && scan.slug !== section.slug) {
    diagnostics.push({
      id: "DEK006",
      message: `data-slug "${scan.slug}" does not match section "${section.slug}"`,
      path,
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
      slug: section.slug,
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
      slug: section.slug,
    });
  }

  if (scan.styleElements) {
    diagnostics.push({
      id: "DEK011",
      message: "slide contains a <style> element",
      path,
      slug: section.slug,
    });
  }
  if (scan.styleAttributes) {
    diagnostics.push({
      id: "DEK011",
      message: "slide contains a style attribute",
      path,
      slug: section.slug,
    });
  }
  if (scan.scriptElements) {
    diagnostics.push({
      id: "DEK011",
      message: "slide contains a <script> element",
      path,
      slug: section.slug,
    });
  }

  if (options.classes) {
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
      });
    }
  }

  for (const ref of scan.refs) {
    const kind = classifyRef(ref, path, options.deckDir);
    if (kind === "remote") {
      diagnostics.push({
        id: "DEK020",
        message: `remote URL "${ref.value}"`,
        path,
      });
    } else if (kind === "escape") {
      diagnostics.push({
        id: "DEK022",
        message: `path "${ref.value}" is outside the deck directory`,
        path,
      });
    } else if (kind === "missing") {
      diagnostics.push({
        id: "DEK021",
        message: `missing image "${ref.value}"`,
        path,
      });
    } else if (kind === "ok" && ref.attr === "src" && !isCanonicalAssetSrc(ref.value)) {
      diagnostics.push({
        id: "DEK023",
        message: `asset "${ref.value}" must be referenced as assets/${posix.basename(ref.value.trim())}`,
        path,
        slug: section.slug,
      });
    }
  }

  return diagnostics;
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

function suggestRename(diagnostics: Diagnostic[]): void {
  const missing = diagnostics.filter((diagnostic) => diagnostic.id === "DEK001");
  const orphans = diagnostics.filter(
    (diagnostic) => diagnostic.id === "DEK002" && diagnostic.path?.endsWith(".html"),
  );
  if (missing.length !== 1 || orphans.length !== 1) {
    return;
  }
  const missingSlug = slugFromPath(missing[0]?.path);
  const orphanSlug = slugFromPath(orphans[0]?.path);
  if (!missingSlug || !orphanSlug) {
    return;
  }
  const hint = `dek mv ${orphanSlug} ${missingSlug}`;
  if (missing[0] && !missing[0].message.includes(hint)) {
    missing[0].message = `${missing[0].message}; ${hint}`;
  }
  if (orphans[0] && !orphans[0].message.includes(hint)) {
    orphans[0].message = `${orphans[0].message}; ${hint}`;
  }
}

function slugFromPath(path?: string): string | undefined {
  const name = path?.split(/[/\\]/).pop();
  return name?.replace(/\.html$/, "");
}
