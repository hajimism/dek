import { ALLOW_FILE, LIST_PATH } from "./manifest.ts";
import { parseYaml, YamlError } from "./yaml.ts";

/** How a verb's forms are found: by its stem and each kana of its row, or by its stem alone. */
type Verb = "godan" | "ichidan";

/** One word on the project's list. */
export type Entry = {
  word: string;
  /** A regular expression looked for instead of `word`. */
  pattern?: string;
  verb?: Verb;
  /** Longer words that hold the word and are not it. */
  except: string[];
  /** What to write instead. */
  use?: string;
  /** Where to look, when only one of them. */
  in?: "slides" | "script";
  /** Where the entry starts in the list. */
  line: number;
};

/** What is wrong with a file, and the line to look at. */
export type Problem = { message: string; line: number };

const VERSION = 1;
const ENTRY_KEYS = new Set(["word", "pattern", "verb", "except", "use", "in"]);

/** The last kana of a godan verb's dictionary form. */
const GODAN_ENDINGS = ["う", "く", "ぐ", "す", "つ", "ぬ", "ぶ", "む", "る"];

/** What YAML made of words written without quotes, when it made them something other than text. */
function unquoted(value: unknown): string | undefined {
  if (typeof value === "number") {
    return `the number ${value}`;
  }
  return typeof value === "boolean" ? String(value) : undefined;
}

type Read = {
  /** The top mapping's fields, or why the file gives none. */
  fields?: Record<string, unknown>;
  problem?: Problem;
  lineOf: (mapping: object) => number | undefined;
  /** The line of the first line matching `pattern`, or of the top. */
  lineWith: (pattern: RegExp) => number;
};

/** A file of this plugin, read as far as its version: a mapping of version 1, or a problem. */
function readFile(source: string, name: string, keys: string[]): Read {
  const lines = source.split(/\r?\n/);
  const lineWith = (pattern: RegExp) => {
    const index = lines.findIndex((text) => pattern.test(text));
    return index === -1 ? 1 : index + 1;
  };
  let parsed: ReturnType<typeof parseYaml>;
  try {
    parsed = parseYaml(source);
  } catch (error) {
    if (error instanceof YamlError) {
      const problem = {
        message: `${name} is not YAML dek-words reads: ${error.message}`,
        line: error.line,
      };
      return { problem, lineOf: () => undefined, lineWith };
    }
    throw error;
  }
  const { value, lineOf } = parsed;
  if (value === null) {
    return { lineOf, lineWith };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { problem: { message: `${name} is not a mapping`, line: 1 }, lineOf, lineWith };
  }
  const fields = value as Record<string, unknown>;
  if (fields.version !== VERSION) {
    const message = `${name} is version ${String(fields.version)}; this dek-words reads version ${VERSION}`;
    return { problem: { message, line: lineWith(/^version\s*:/) }, lineOf, lineWith };
  }
  const extra = Object.keys(fields).find((key) => key !== "version" && !keys.includes(key));
  if (extra !== undefined) {
    const hint = keys.length === 1 ? `; write \`${keys[0]}\`` : "";
    const message = `${name} has \`${extra}\`, which it does not take${hint}`;
    return { problem: { message, line: lineWith(new RegExp(`^${extra}\\s*:`)) }, lineOf, lineWith };
  }
  return { fields, lineOf, lineWith };
}

/**
 * The entries of the project's list, and what keeps the rest from being used. An entry with a
 * problem is left out, so every entry that reads is still checked.
 */
export function readList(source: string): { entries: Entry[]; problems: Problem[] } {
  const file = readFile(source, LIST_PATH, ["words"]);
  if (file.problem) {
    return { entries: [], problems: [file.problem] };
  }
  const words = file.fields?.words;
  if (words === undefined || words === null) {
    return { entries: [], problems: [] };
  }
  if (!Array.isArray(words)) {
    return {
      entries: [],
      problems: [{ message: "`words` is not a list", line: file.lineWith(/^words\s*:/) }],
    };
  }
  const entries: Entry[] = [];
  const problems: Problem[] = [];
  const seen = new Set<string>();
  words.forEach((item: unknown, index) => {
    const fields =
      typeof item === "object" && item !== null && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : undefined;
    const line = (fields && file.lineOf(fields)) ?? file.lineWith(/^words\s*:/);
    const read = readEntry(fields, `#${index + 1}`, line);
    if ("problem" in read) {
      problems.push({ message: read.problem, line });
      return;
    }
    if (seen.has(read.entry.word)) {
      problems.push({ message: `entry ${read.entry.word} is on the list twice; keep one`, line });
      return;
    }
    seen.add(read.entry.word);
    entries.push(read.entry);
  });
  return { entries, problems };
}

/** Every `word` the list names, entries that do not read included, so an allow of one is no mistake. */
export function listedWords(source: string): Set<string> {
  const { fields } = readFile(source, LIST_PATH, ["words"]);
  const words = Array.isArray(fields?.words) ? fields.words : [];
  return new Set(
    words.flatMap((item: unknown) => {
      const word = (item as { word?: unknown } | null)?.word;
      return typeof word === "string" && word !== "" ? [word] : [];
    }),
  );
}

function readEntry(
  fields: Record<string, unknown> | undefined,
  position: string,
  line: number,
): { entry: Entry } | { problem: string } {
  if (fields === undefined) {
    return { problem: `entry ${position} is not a mapping of \`word\` and the rest` };
  }
  const word = typeof fields.word === "string" && fields.word !== "" ? fields.word : undefined;
  const name = word ?? position;
  for (const key of ["word", "pattern", "use"] as const) {
    const made = unquoted(fields[key]);
    if (made !== undefined) {
      return { problem: `entry ${name}: YAML reads its \`${key}\` as ${made}; put it in quotes` };
    }
  }
  if (word === undefined) {
    return { problem: `entry ${name} has no \`word\`` };
  }
  const extra = Object.keys(fields).find((key) => !ENTRY_KEYS.has(key));
  if (extra !== undefined) {
    return { problem: `entry ${word} has \`${extra}\`, which the list does not take` };
  }
  const { pattern, verb, except = [], use, in: where } = fields;
  if (pattern !== undefined && verb !== undefined) {
    return { problem: `entry ${word} has both \`verb\` and \`pattern\`; keep one` };
  }
  if (pattern !== undefined) {
    const problem = patternProblem(pattern);
    if (problem) {
      return { problem: `entry ${word}: ${problem}` };
    }
  }
  if (verb !== undefined) {
    const problem = verbProblem(word, verb);
    if (problem) {
      return { problem: `entry ${word}: ${problem}` };
    }
  }
  if (!Array.isArray(except) || except.some((item) => typeof item !== "string" || item === "")) {
    return { problem: `entry ${word}: \`except\` is a list of words` };
  }
  if (use !== undefined && typeof use !== "string") {
    return { problem: `entry ${word}: \`use\` is text` };
  }
  if (where !== undefined && where !== "slides" && where !== "script") {
    return { problem: `entry ${word}: \`in\` is slides or script, not ${String(where)}` };
  }
  return {
    entry: {
      word,
      ...(typeof pattern === "string" ? { pattern } : {}),
      ...(verb === "godan" || verb === "ichidan" ? { verb } : {}),
      except: except as string[],
      ...(typeof use === "string" && use !== "" ? { use } : {}),
      ...(where === "slides" || where === "script" ? { in: where } : {}),
      line,
    },
  };
}

function patternProblem(pattern: unknown): string | undefined {
  if (typeof pattern !== "string" || pattern === "") {
    return "`pattern` is a regular expression, written as text";
  }
  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern, "iu");
  } catch {
    return `\`pattern\` is not a regular expression: ${pattern}`;
  }
  return compiled.test("") ? "`pattern` matches where there is no text" : undefined;
}

function verbProblem(word: string, verb: unknown): string | undefined {
  if (verb !== "godan" && verb !== "ichidan") {
    return `\`verb\` is godan or ichidan, not ${String(verb)}`;
  }
  const letters = [...word];
  const last = letters.at(-1) ?? "";
  if (verb === "godan" && (letters.length < 2 || !GODAN_ENDINGS.includes(last))) {
    return `a godan verb ends in ${GODAN_ENDINGS.slice(0, -1).join(", ")}, or る`;
  }
  if (verb === "ichidan" && (letters.length < 2 || last !== "る")) {
    return "an ichidan verb ends in る";
  }
  // An ichidan verb is found by its stem alone, and 見 alone is in 意見 and 見解.
  if (verb === "ichidan" && letters.length === 2) {
    return `its stem ${letters[0]} is one letter, which too many words hold; write a \`pattern\` for its forms`;
  }
  return undefined;
}

/** The words a deck allows, each an entry's `word`, and what is wrong with the file. */
export function readAllows(
  source: string,
  listed: Set<string>,
): { allows: Set<string>; problems: Problem[] } {
  const file = readFile(source, ALLOW_FILE, ["allow"]);
  if (file.problem) {
    return { allows: new Set(), problems: [file.problem] };
  }
  const allow = file.fields?.allow;
  if (allow === undefined || allow === null) {
    return { allows: new Set(), problems: [] };
  }
  const listLine = file.lineWith(/^allow\s*:/);
  if (!Array.isArray(allow)) {
    return {
      allows: new Set(),
      problems: [{ message: "`allow` is a list of words", line: listLine }],
    };
  }
  const allows = new Set<string>();
  const problems: Problem[] = [];
  const lines = source.split(/\r?\n/);
  for (const item of allow) {
    const word = typeof item === "string" ? item : String(item);
    const index = lines.findIndex(
      (text, at) =>
        at >= listLine && new RegExp(`^\\s*-\\s*['"]?${literal(word)}['"]?\\s*(#.*)?$`).test(text),
    );
    const line = index === -1 ? listLine : index + 1;
    if (typeof item !== "string") {
      problems.push({
        message: `${ALLOW_FILE}: YAML reads an allow as ${unquoted(item) ?? "no text"}; put it in quotes`,
        line,
      });
    } else if (!listed.has(item)) {
      problems.push({
        message: `${ALLOW_FILE} allows ${item}, which is no entry on ${LIST_PATH}`,
        line,
      });
    } else {
      allows.add(item);
    }
  }
  return { allows, problems };
}

/** `text` as a regular expression that matches it as written. */
export function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
