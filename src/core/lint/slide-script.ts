import { readFileSync } from "node:fs";
import { type Diagnostic, diag } from "../diagnostic.ts";
import { listSlideFiles } from "../resolve.ts";
import type { Section } from "../schema.ts";
import type { SlideScriptProblem } from "../slide-script.ts";
import type { ScriptInput } from "../slide-script-eval.ts";
import { stepKeys } from "../step.ts";
import type { DeckFiles, LintContext } from "./context.ts";

export type LintedScript = { section: Section; path: string; input: ScriptInput };

/**
 * The `slides/<slug>.ts` scripts lint evaluates, each read once: one per section that has HTML.
 * Evaluating is the slow part of lint, so `lintDeck` does it before the rules run.
 */
export function lintedSlideScripts(files: DeckFiles): LintedScript[] {
  const scripts = new Map(listSlideFiles(files.deck.dir, ".ts").map((file) => [file.slug, file]));
  return [...files.sectionsBySlug.values()].flatMap((section) => {
    const path = scripts.get(section.slug)?.path;
    if (!path || !files.slidesBySlug.has(section.slug)) {
      return [];
    }
    const steps = stepKeys(section.beats);
    return [{ section, path, input: { code: readFileSync(path, "utf8"), steps } }];
  });
}

/** DEK016 from what evaluating each script found, and DEK017 from its source, by slug. */
export function slideScriptDiagnostics(
  scripted: LintedScript[],
  problems: SlideScriptProblem[][],
): Map<string, Diagnostic[]> {
  return new Map(
    scripted.map(({ section, path, input }, index) => [
      section.slug,
      [
        ...(problems[index] ?? []).map(({ message, line, hint }) =>
          diag("DEK016", {
            message,
            path,
            ...(line !== undefined ? { line } : {}),
            slug: section.slug,
            ...(hint !== undefined ? { hint } : {}),
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

/** DEK016 for a slides/<slug>.js, which dek does not load: motion is written in TypeScript. */
export function javascriptDiagnostics(ctx: LintContext): Diagnostic[] {
  return listSlideFiles(ctx.deck.dir, ".js").map((file) =>
    diag("DEK016", {
      message: `slide scripts are TypeScript; rename ${file.slug}.js to ${file.slug}.ts`,
      path: file.path,
      slug: file.slug,
      hint: `run \`mv slides/${file.slug}.js slides/${file.slug}.ts\`; plain JavaScript is valid TypeScript`,
      data: { file: `slides/${file.slug}.js` },
    }),
  );
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
  {
    // One slide is on a still page, and every slide is in the built deck.
    re: /\bdocument\s*\.\s*(querySelectorAll|querySelector|getElementById|getElementsBy\w+|body|documentElement)\b/g,
    find: (m) => ({
      message: `document.${m[1]} reaches every slide in the deck; find elements from the slide draw is given, as slide.querySelector`,
      data: { call: `document.${m[1]}` },
    }),
  },
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
