import { moduleFilePath } from "./path.ts";
import { compileSlideScript, IMPORTS_PROBLEM, staticProblems } from "./slide-script.ts";

/** One slide script as lint checks it: its source, and the slide's step keys to check `motion` by. */
export type ScriptInput = { code: string; steps?: string[] };

/** How long lint waits for every slide script's top-level code, in total. */
const EVAL_BUDGET_MS = 5000;

/**
 * What stops each `slides/<slug>.ts` from running as a slide script. A script is one
 * self-contained module whose only export is the default object. Given the slide's step keys,
 * the module is also evaluated so `motion` can be checked against the beats it names.
 * Evaluation happens in one child process that cannot reach dek's globals and is killed if it
 * hangs; this waits for it. Scripts evaluated before are answered from a cache.
 */
export function slideScriptsProblems(scripts: ScriptInput[]): string[][] {
  const { results, pending } = prepareScripts(scripts);
  const codes = uncached(pending);
  if (codes.length > 0) {
    const stdout = Bun.spawnSync(evaluatorCommand(), {
      ...EVALUATOR_OPTIONS,
      stdin: Buffer.from(JSON.stringify(codes)),
      timeout: EVAL_BUDGET_MS,
    }).stdout.toString();
    cacheSummaries(codes, parseSummaries(codes.length, stdout));
  }
  return finishProblems(results, pending);
}

/**
 * `slideScriptsProblems` without blocking the event loop while the scripts run, for the dev
 * server. The answer is about the code passed in, however the files change in the meantime.
 */
export async function evaluateSlideScripts(scripts: ScriptInput[]): Promise<string[][]> {
  const { results, pending } = prepareScripts(scripts);
  const codes = uncached(pending);
  if (codes.length > 0) {
    const child = Bun.spawn(evaluatorCommand(), {
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
  return finishProblems(results, pending);
}

/**
 * A pending evaluation. `withoutImports` marks a script evaluated with its
 * imports removed, so lint can still check `motion`; what then fails at run
 * time is the missing import's doing, already reported.
 */
type PendingScript = { index: number; code: string; steps: string[]; withoutImports: boolean };

const IMPORT_RE = /^[ \t]*import\s+(?:type\s+)?(?:[\s\S]*?\sfrom\s*)?["'][^"'\n]+["'][ \t]*;?/gm;

/** The code with its import declarations blanked out, lines kept in place. */
function withoutImports(code: string): string {
  return code.replace(IMPORT_RE, (match) => match.replace(/[^\n]/g, " "));
}

function prepareScripts(scripts: ScriptInput[]): {
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

/** The compiled code of each pending script the cache has no summary for, once each. */
function uncached(pending: PendingScript[]): string[] {
  return [...new Set(pending.map((entry) => entry.code))].filter((code) => !summaryCache.has(code));
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

function evaluatorCommand(): string[] {
  const worker = moduleFilePath(new URL("./slide-eval-worker.ts", import.meta.url));
  return [process.execPath, "--no-install", worker];
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
