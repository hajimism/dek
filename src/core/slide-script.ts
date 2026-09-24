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

type PendingScript = { index: number; code: string; steps: string[] };

function prepareScripts(scripts: Array<{ code: string; steps?: string[] }>): {
  results: string[][];
  pending: PendingScript[];
} {
  const results: string[][] = [];
  const pending: PendingScript[] = [];
  for (const [index, script] of scripts.entries()) {
    const problems = staticProblems(script.code);
    const compiled = problems.length > 0 ? undefined : compileSlideScript(script.code, "slide");
    if (compiled && "problem" in compiled) {
      problems.push(compiled.problem);
    }
    results.push(problems);
    if (compiled && "code" in compiled && script.steps) {
      pending.push({ index, code: compiled.code, steps: script.steps });
    }
  }
  return { results, pending };
}

function finishProblems(results: string[][], pending: PendingScript[]): string[][] {
  for (const entry of pending) {
    results[entry.index] = moduleProblems(summaryCache.get(entry.code), entry.steps);
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
    problems.push("imports are not supported; keep the slide script self-contained");
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
