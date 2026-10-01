import { readFileSync } from "node:fs";
import { DekcError } from "./error.ts";
import { escapeRegExp } from "./escape.ts";
import { listSlideFiles } from "./resolve.ts";
import { stillDrawScript } from "./slide-draw.ts";

/** Slide scripts are `slides/<slug>.ts`; plain JavaScript is valid TypeScript. */
const transpiler = new Bun.Transpiler({ loader: "ts" });

const DEFAULT_EXPORT_RE = /\bexport\s+default\b/;
/** In transpiled output, comments are gone and each statement starts a line. */
const EXPORT_DEFAULT_LINE_RE = /^export default\b/gm;
const DECLARATION_RE =
  /^export default ((?:async\s+)?function\s*\*?\s*|class\s+)([A-Za-z_$][\w$]*)/;

export type SlideScript = {
  slug: string;
  path: string;
  /** A classic script that registers the slide, safe to put inside `<script>`. */
  code: string;
};

/** What stops a slide script from running: where, when the source has a place for it, and the fix. */
export type SlideScriptProblem = { message: string; line?: number; hint?: string };

export const IMPORTS_MESSAGE = "imports are not supported; keep the slide script self-contained";

/** The 1-based line of the first line `re` matches, if any. */
export function lineMatching(code: string, re: RegExp): number | undefined {
  const index = code.split("\n").findIndex((line) => re.test(line));
  return index < 0 ? undefined : index + 1;
}

function withLine(problem: SlideScriptProblem, line: number | undefined): SlideScriptProblem {
  return line === undefined ? problem : { ...problem, line };
}

/**
 * What stops a script from being one self-contained module whose only export is the default
 * object, found without running it.
 */
export function staticProblems(code: string): SlideScriptProblem[] {
  let scan: ReturnType<Bun.Transpiler["scan"]>;
  try {
    scan = transpiler.scan(code);
  } catch (error) {
    return [syntaxProblem(error)];
  }
  const problems: SlideScriptProblem[] = [];
  if (scan.imports.length > 0) {
    problems.push(
      withLine(
        {
          message: IMPORTS_MESSAGE,
          hint: "remove the import and write what it gave in this file; DekcSlide is global, from .dekc/slide.d.ts",
        },
        lineMatching(code, /^\s*import\b/),
      ),
    );
  }
  for (const name of scan.exports.filter((entry) => entry !== "default")) {
    problems.push(
      withLine(
        {
          message: `only a default export is allowed; found "${name}"`,
          hint: `drop export from "${name}", or make it part of the default export`,
        },
        lineMatching(
          code,
          new RegExp(`^\\s*export\\b(?!\\s+default\\b).*\\b${escapeRegExp(name)}\\b`),
        ),
      ),
    );
  }
  if (!scan.exports.includes("default") || !DEFAULT_EXPORT_RE.test(code)) {
    problems.push({
      message: "missing export default",
      hint: "end the script with export default { draw(slide, { t }) {} } satisfies DekcSlide",
    });
  }
  return problems;
}

const SYNTAX_HINT = "fix the syntax there; until the script parses, the slide shows without it";

/**
 * A syntax error as Bun reports it: one message with its position, or several, of which the first
 * says the most. "Parse error" alone names neither.
 */
function syntaxProblem(error: unknown): SlideScriptProblem {
  type Located = { message?: string; position?: { line?: number } | null };
  const first: Located =
    error instanceof AggregateError && error.errors.length > 0
      ? (error.errors[0] as Located)
      : (error as Located);
  const message = first.message ?? messageOf(error);
  const line = first.position?.line;
  return {
    message: `syntax error: ${message}`,
    ...(typeof line === "number" && line > 0 ? { line } : {}),
    hint: SYNTAX_HINT,
  };
}

/**
 * Turns the module into a classic script that registers its default export
 * as `window.__dekcSlides[slug]`, each slide in its own function scope. Of the
 * lines that start with `export default`, the real one is the only one whose
 * rewrite parses; a template literal can hold look-alikes, a comment cannot.
 */
export function compileSlideScript(
  code: string,
  slug: string,
): { code: string } | { problem: SlideScriptProblem } {
  let js: string;
  try {
    js = transpiler.transformSync(code);
  } catch (error) {
    return { problem: syntaxProblem(error) };
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
          problem: withLine(
            {
              message:
                "top-level await is not supported; the slide script must finish when it loads",
              hint: "drop the await: draw from t alone, with nothing to wait for",
            },
            lineMatching(code, /\bawait\b/),
          ),
        };
      }
    }
  }
  return {
    problem: firstError
      ? { message: `syntax error: ${messageOf(firstError)}`, hint: SYNTAX_HINT }
      : { message: "missing export default" },
  };
}

/** Keeps a declaration's name bound: `export default function draw` still defines `draw`. */
function rewriteDefaultExport(js: string, index: number): string {
  const rest = js.slice(index);
  const declaration = DECLARATION_RE.exec(rest);
  if (declaration) {
    const kept = rest.slice("export default ".length);
    return `${js.slice(0, index)}${kept}\n__dekcDefault = ${declaration[2]};`;
  }
  return `${js.slice(0, index)}__dekcDefault =${rest.slice("export default".length)}`;
}

function wrap(body: string, slug: string, async: boolean): string {
  return `(window.__dekcSlides ||= {})[${JSON.stringify(slug)}] = (${async ? "async " : ""}function () {
"use strict";
var __dekcDefault;
${body}
return __dekcDefault;
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

/** A slide script as read from disk: compiled, or the problem that stops it. */
export type SlideScriptEntry =
  | SlideScript
  | { slug: string; path: string; problem: SlideScriptProblem };

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
 * The scripts that can run. A broken one is skipped and left to lint (DEKC016),
 * unless `strict`, where the render refuses to build without it.
 */
export function usableSlideScripts(entries: SlideScriptEntry[], strict: boolean): SlideScript[] {
  return entries.flatMap((entry) => {
    if (!("problem" in entry)) {
      return [entry];
    }
    if (strict) {
      throw new DekcError(`invalid slide script "${entry.slug}": ${entry.problem.message}`, {
        path: entry.path,
        hint: "run `dekc lint`",
      });
    }
    return [];
  });
}

/**
 * The deck's slide scripts, compiled. The dev server skips a broken one and
 * lets lint report it (DEKC016); `strict` renders refuse to build without it.
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
    .map((script) => `<script data-dekc-slides="${script.slug}">${script.code}</script>`)
    .join("");
}

/**
 * What a still page runs: its slides' scripts, then the still script that draws
 * them and ends every animation. Every still page carries it, since the theme's
 * own animations need ending even where no slide has a script.
 */
export function stillPageScript(scripts: SlideScript[]): string {
  return `${slideScriptTags(scripts)}<script>${stillDrawScript()}</script>`;
}
