import { readFileSync } from "node:fs";
import { DekError } from "./error.ts";
import { moduleFilePath } from "./path.ts";
import { listSlideFiles } from "./resolve.ts";
import { stillDrawScript } from "./slide-draw.ts";

/** Slide scripts are `slides/<slug>.ts`; plain JavaScript is valid TypeScript. */
const transpiler = new Bun.Transpiler({ loader: "ts" });

/** How long lint waits for every slide script's top-level code, in total. */
const EVAL_BUDGET_MS = 5000;
const DEFAULT_EXPORT_RE = /\bexport\s+default\b/;
/** In transpiled output, comments are gone and each statement starts a line. */
const EXPORT_DEFAULT_LINE_RE = /^export default\b/gm;
const DECLARATION_RE =
  /^export default ((?:async\s+)?function\s*\*?\s*|class\s+)([A-Za-z_$][\w$]*)/;

/** The message for a `slides/<slug>.js`, which dek does not load. */
export function javascriptScriptProblem(slug: string): string {
  return `slide scripts are TypeScript; rename ${slug}.js to ${slug}.ts`;
}

export type SlideScript = {
  slug: string;
  path: string;
  /** A classic script that registers the slide, safe to put inside `<script>`. */
  code: string;
};

/**
 * What stops `slides/<slug>.ts` from running as a slide script. The script is
 * one self-contained module whose only export is the default object. Given
 * the slide's step keys, the module is also evaluated so `motion` can be
 * checked against the beats it names.
 */
export function slideScriptProblems(code: string, options: { steps?: string[] } = {}): string[] {
  return slideScriptsProblems([{ code, steps: options.steps }])[0] ?? [];
}

/**
 * `slideScriptProblems` for many scripts at once. Evaluation happens in one
 * child process that cannot reach dek's globals and is killed if it hangs.
 * Scripts `warmSlideScripts` already evaluated are answered from its cache.
 */
export function slideScriptsProblems(
  scripts: Array<{ code: string; steps?: string[] }>,
): string[][] {
  const { results, pending } = prepareScripts(scripts);
  const missing = pending.filter((entry) => !summaryCache.has(entry.code));
  cacheSummaries(
    missing.map((entry) => entry.code),
    parseSummaries(missing.length, spawnEvaluator(missing.map((entry) => entry.code))),
  );
  return finishProblems(results, pending);
}

/**
 * Evaluates the scripts in the background and caches what they report, so
 * a following `slideScriptsProblems` (and so `lintDeck`) does not block on a
 * child process. The dev server awaits this before linting.
 */
export async function warmSlideScripts(
  scripts: Array<{ code: string; steps?: string[] }>,
): Promise<void> {
  const codes = prepareScripts(scripts)
    .pending.map((entry) => entry.code)
    .filter((code) => !summaryCache.has(code));
  if (codes.length === 0) {
    return;
  }
  const child = Bun.spawn([process.execPath, "--no-install", evaluatorPath()], {
    ...EVALUATOR_OPTIONS,
    stdin: Buffer.from(JSON.stringify(codes)),
  });
  const timer = setTimeout(() => child.kill(), EVAL_BUDGET_MS);
  try {
    const stdout = await new Response(child.stdout).text();
    await child.exited;
    cacheSummaries(codes, parseSummaries(codes.length, stdout));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A pending evaluation. `withoutImports` marks a script evaluated with its
 * imports removed, so lint can still check `motion`; what then fails at run
 * time is the missing import's doing, already reported.
 */
type PendingScript = { index: number; code: string; steps: string[]; withoutImports: boolean };

const IMPORTS_PROBLEM = "imports are not supported; keep the slide script self-contained";
const IMPORT_RE = /^[ \t]*import\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s*)?["'][^"'\n]+["'][ \t]*;?/gm;

/** The code with its import declarations blanked out, lines kept in place. */
function withoutImports(code: string): string {
  return code.replace(IMPORT_RE, (match) => match.replace(/[^\n]/g, " "));
}

function prepareScripts(scripts: Array<{ code: string; steps?: string[] }>): {
  results: string[][];
  pending: PendingScript[];
} {
  const results: string[][] = [];
  const pending: PendingScript[] = [];
  for (const [index, script] of scripts.entries()) {
    const problems = staticProblems(script.code);
    // Imports alone do not stop the rest of the checks: report everything in one run.
    const importsOnly = problems.length > 0 && problems.every((p) => p === IMPORTS_PROBLEM);
    const source = importsOnly ? withoutImports(script.code) : script.code;
    const compiled =
      problems.length > 0 && !importsOnly ? undefined : compileSlideScript(source, "slide");
    if (compiled && "problem" in compiled) {
      problems.push(compiled.problem);
    }
    results.push(problems);
    if (compiled && "code" in compiled && script.steps) {
      pending.push({
        index,
        code: compiled.code,
        steps: script.steps,
        withoutImports: importsOnly,
      });
    }
  }
  return { results, pending };
}

function finishProblems(results: string[][], pending: PendingScript[]): string[][] {
  for (const entry of pending) {
    const summary = summaryCache.get(entry.code);
    const blamedOnImports =
      entry.withoutImports &&
      summary !== undefined &&
      ("threw" in summary || "timedOut" in summary);
    const found = blamedOnImports ? [] : moduleProblems(summary, entry.steps);
    results[entry.index] = [...(results[entry.index] ?? []), ...found];
  }
  return results;
}

function staticProblems(code: string): string[] {
  let scan: ReturnType<Bun.Transpiler["scan"]>;
  try {
    scan = transpiler.scan(code);
  } catch (error) {
    return [`syntax error: ${messageOf(error)}`];
  }
  const problems: string[] = [];
  if (scan.imports.length > 0) {
    problems.push(IMPORTS_PROBLEM);
  }
  for (const name of scan.exports.filter((entry) => entry !== "default")) {
    problems.push(`only a default export is allowed; found "${name}"`);
  }
  if (!scan.exports.includes("default") || !DEFAULT_EXPORT_RE.test(code)) {
    problems.push("missing export default");
  }
  return problems;
}

/** What the evaluator reports for one module; see slide-eval-worker.ts. */
type ModuleSummary =
  | { threw: string }
  | { timedOut: true }
  | { object: false }
  | { object: true; draw: string; motion: "none" | "invalid" | Array<[string, number | null]> };

/** Summaries by compiled code; the evaluation depends on nothing else. */
const summaryCache = new Map<string, ModuleSummary>();
const SUMMARY_CACHE_LIMIT = 256;

const EVALUATOR_OPTIONS = { stdout: "pipe", stderr: "ignore", env: {} } as const;

function evaluatorPath(): string {
  return moduleFilePath(new URL("./slide-eval-worker.ts", import.meta.url));
}

function spawnEvaluator(codes: string[]): string {
  if (codes.length === 0) {
    return "";
  }
  return Bun.spawnSync([process.execPath, "--no-install", evaluatorPath()], {
    ...EVALUATOR_OPTIONS,
    stdin: Buffer.from(JSON.stringify(codes)),
    timeout: EVAL_BUDGET_MS,
  }).stdout.toString();
}

/** A worker that was killed still wrote a line for every script it finished. */
function parseSummaries(count: number, stdout: string): Array<ModuleSummary | undefined> {
  const lines = stdout.split("\n").filter(Boolean);
  return Array.from({ length: count }, (_, index) => {
    const line = lines[index];
    return line ? (JSON.parse(line) as ModuleSummary) : undefined;
  });
}

/** A script left unfinished because the budget ran out is not cached; it is tried again. */
function cacheSummaries(codes: string[], summaries: Array<ModuleSummary | undefined>): void {
  for (const [index, code] of codes.entries()) {
    const summary = summaries[index];
    if (!summary) {
      continue;
    }
    summaryCache.delete(code);
    summaryCache.set(code, summary);
    if (summaryCache.size > SUMMARY_CACHE_LIMIT) {
      const oldest = summaryCache.keys().next().value;
      if (oldest !== undefined) {
        summaryCache.delete(oldest);
      }
    }
  }
}

function moduleProblems(summary: ModuleSummary | undefined, steps: string[]): string[] {
  if (!summary || "timedOut" in summary) {
    return ["top-level code did not finish; touch the slide only inside draw"];
  }
  if ("threw" in summary) {
    return [`top-level code threw: ${summary.threw}; touch the slide only inside draw`];
  }
  if (!summary.object) {
    return ["export default must be an object like { motion, draw }"];
  }
  const problems: string[] = [];
  if (summary.draw !== "undefined" && summary.draw !== "function") {
    problems.push("draw must be a function");
  }
  if (summary.motion === "none") {
    return problems;
  }
  if (summary.motion === "invalid") {
    return [...problems, "motion must be an object keyed by beat"];
  }
  for (const [key, ms] of summary.motion) {
    if (!steps.includes(key)) {
      problems.push(
        `motion key "${key}" is not a beat of this slide; use one of: ${steps.join(", ")}`,
      );
    } else if (ms === null || ms < 0) {
      problems.push(`motion "${key}" must be a non-negative number of milliseconds`);
    }
  }
  return problems;
}

/**
 * Turns the module into a classic script that registers its default export
 * as `window.__dekSlides[slug]`, each slide in its own function scope. Of the
 * lines that start with `export default`, the real one is the only one whose
 * rewrite parses; a template literal can hold look-alikes, a comment cannot.
 */
function compileSlideScript(code: string, slug: string): { code: string } | { problem: string } {
  let js: string;
  try {
    js = transpiler.transformSync(code);
  } catch (error) {
    return { problem: `syntax error: ${messageOf(error)}` };
  }
  let firstError: unknown;
  for (const match of js.matchAll(EXPORT_DEFAULT_LINE_RE)) {
    const body = rewriteDefaultExport(js, match.index ?? 0);
    try {
      const wrapped = escapeForScriptTag(wrap(body, slug, false));
      new Function(wrapped);
      return { code: wrapped };
    } catch (error) {
      firstError ??= error;
      if (parses(wrap(body, slug, true))) {
        return {
          problem: "top-level await is not supported; the slide script must finish when it loads",
        };
      }
    }
  }
  return {
    problem: firstError ? `syntax error: ${messageOf(firstError)}` : "missing export default",
  };
}

/** Keeps a declaration's name bound: `export default function draw` still defines `draw`. */
function rewriteDefaultExport(js: string, index: number): string {
  const rest = js.slice(index);
  const declaration = DECLARATION_RE.exec(rest);
  if (declaration) {
    const kept = rest.slice("export default ".length);
    return `${js.slice(0, index)}${kept}\n__dekDefault = ${declaration[2]};`;
  }
  return `${js.slice(0, index)}__dekDefault =${rest.slice("export default".length)}`;
}

function wrap(body: string, slug: string, async: boolean): string {
  return `(window.__dekSlides ||= {})[${JSON.stringify(slug)}] = (${async ? "async " : ""}function () {
"use strict";
var __dekDefault;
${body}
return __dekDefault;
})();
`;
}

function parses(code: string): boolean {
  try {
    new Function(code);
    return true;
  } catch {
    return false;
  }
}

/** `</script` and `<!--` would end or confuse the tag; `<\/` means the same inside JS. */
function escapeForScriptTag(code: string): string {
  return code.replace(/<(\/script|!--)/gi, "<\\$1");
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Compiles one module for `slug`; exported for tests. */
export function wrapSlideScript(code: string, slug: string): string {
  const compiled = compileSlideScript(code, slug);
  if ("problem" in compiled) {
    throw new DekError(`invalid slide script "${slug}": ${compiled.problem}`);
  }
  return compiled.code;
}

/** A slide script as read from disk: compiled, or the problem that stops it. */
export type SlideScriptEntry = SlideScript | { slug: string; path: string; problem: string };

/** Compiles every `slides/<slug>.ts`, or only `only`'s, without deciding what a problem means. */
export function loadSlideScripts(deckDir: string, only?: string): SlideScriptEntry[] {
  return listSlideFiles(deckDir, ".ts")
    .filter((slide) => only === undefined || slide.slug === only)
    .map((slide) => {
      const source = readFileSync(slide.path, "utf8");
      const problem = staticProblems(source)[0];
      const compiled = problem ? { problem } : compileSlideScript(source, slide.slug);
      return { slug: slide.slug, path: slide.path, ...compiled };
    });
}

/**
 * The scripts that can run. A broken one is skipped and left to lint (DEK016),
 * unless `strict`, where the render refuses to build without it.
 */
export function usableSlideScripts(entries: SlideScriptEntry[], strict: boolean): SlideScript[] {
  return entries.flatMap((entry) => {
    if (!("problem" in entry)) {
      return [entry];
    }
    if (strict) {
      throw new DekError(`invalid slide script "${entry.slug}": ${entry.problem}`, {
        path: entry.path,
        hint: "run `dek lint`",
      });
    }
    return [];
  });
}

/**
 * The deck's slide scripts, compiled. The dev server skips a broken one and
 * lets lint report it (DEK016); `strict` renders refuse to build without it.
 * `only` limits the read to one slide, for pages that show one slide.
 */
export function readSlideScripts(
  deckDir: string,
  options: { strict?: boolean; only?: string } = {},
): SlideScript[] {
  return usableSlideScripts(loadSlideScripts(deckDir, options.only), options.strict ?? false);
}

/** One tag per slide, so a script that throws while loading cannot stop the others. */
export function slideScriptTags(scripts: SlideScript[]): string {
  return scripts
    .map((script) => `<script data-dek-slides="${script.slug}">${script.code}</script>`)
    .join("");
}

/** The scripts a still page needs, or "" when none of its slides has one. */
export function stillPageScript(scripts: SlideScript[]): string {
  return scripts.length > 0
    ? `${slideScriptTags(scripts)}<script>${stillDrawScript()}</script>`
    : "";
}

export type SeekProblem = {
  line: number;
  message: string;
  /** The call that reads a clock, or the class used to find an element. */
  data: { call: string } | { class: string };
};

const CLOCK_MESSAGE =
  "runs on its own clock; draw from t alone so video and screenshots can seek it";

type SeekFinding = { message: string; data: SeekProblem["data"] } | undefined;

const clock = (call: string): SeekFinding => ({
  message: `${call} ${CLOCK_MESSAGE}`,
  data: { call },
});
const byClass = (name: string | undefined): SeekFinding =>
  name
    ? {
        message: `finds elements by class ".${name}"; give the element a data-* attribute and select that`,
        data: { class: name },
      }
    : undefined;

const SEEK_PATTERNS: Array<{ re: RegExp; find: (match: RegExpMatchArray) => SeekFinding }> = [
  {
    re: /\b(setTimeout|setInterval|requestAnimationFrame|requestIdleCallback|Date\.now|performance\.now)\s*\(/g,
    find: (m) => clock(m[1] ?? ""),
  },
  { re: /\bnew\s+Date\b/g, find: () => clock("new Date") },
  {
    re: /\bMath\.random\s*\(/g,
    find: () => ({
      message: "Math.random differs on every call; derive the value from t or the slide's beats",
      data: { call: "Math.random" },
    }),
  },
  {
    re: /\b(?:querySelectorAll|querySelector|closest|matches)\s*\(\s*(["'`])((?:(?!\1)[^\\\n])*)\1/g,
    find: (m) =>
      byClass((m[2] ?? "").replace(/\[[^\]]*\]/g, "").match(/\.(-?[_a-zA-Z][\w-]*)/)?.[1]),
  },
  { re: /\bgetElementsByClassName\s*\(\s*(["'`])\s*([\w-]+)/g, find: (m) => byClass(m[2]) },
];

/**
 * DEK017: what makes a slide script draw something other than a function of
 * `t`, so a seek to the same `t` in video, screenshots, or the PDF would not
 * give the same frame. Also classes used to find elements, which a theme may
 * rename. Comments are ignored; lines are 1-based.
 */
export function seekProblems(code: string): SeekProblem[] {
  const source = blankComments(code);
  const found: Array<SeekProblem & { index: number }> = [];
  for (const { re, find } of SEEK_PATTERNS) {
    for (const match of source.matchAll(re)) {
      const finding = find(match);
      if (finding) {
        const index = match.index ?? 0;
        found.push({ index, line: source.slice(0, index).split("\n").length, ...finding });
      }
    }
  }
  return found.sort((a, b) => a.index - b.index).map(({ index: _index, ...problem }) => problem);
}

/** Comments replaced by spaces, newlines and string literals kept. */
function blankComments(code: string): string {
  let out = "";
  let quote: string | undefined;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i] ?? "";
    if (quote !== undefined) {
      out += ch;
      if (ch === "\\") {
        out += code[i + 1] ?? "";
        i++;
      } else if (ch === quote) {
        quote = undefined;
      }
      continue;
    }
    if (ch === "/" && code[i + 1] === "/") {
      while (i < code.length && code[i] !== "\n") {
        out += " ";
        i++;
      }
      out += code[i] ?? "";
      continue;
    }
    if (ch === "/" && code[i + 1] === "*") {
      const end = code.indexOf("*/", i + 2);
      const stop = end < 0 ? code.length : end + 2;
      out += code.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop - 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    }
    out += ch;
  }
  return out;
}
