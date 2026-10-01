import { DekcError } from "./error.ts";
import { splitLines } from "./lines.ts";
import { type Beat, Deck, Frontmatter, Id, inferLang, type Section } from "./schema.ts";
import { scriptLines } from "./script-lines.ts";
import { configHint, formatZodIssues, parseFailure } from "./zod.ts";

const HEADING_RE = /^(#{2,3})(?!#)\s+(.*)$/;
const TRAILING_ATTR_RE = /^(.*?)\s*\{([^}]*)\}\s*$/;
const ID_ATTR_RE = /^#([a-z0-9-]+)$/;
const YAML_PAIR_RE = /^(\s*[\w-]+\s*:)(\s*)(.*)$/;

/** One thing that stops a script.md from being read, where it is and how to fix it. */
export type ScriptProblem = { message: string; line?: number; hint?: string };

/**
 * A script.md that cannot be read, with every problem that stops it, so one run reports them all.
 * The first is the error's own message, line, and hint, for a command that stops on it.
 */
export class ScriptError extends DekcError {
  readonly problems: ScriptProblem[];

  constructor(problems: [ScriptProblem, ...ScriptProblem[]], path: string | undefined) {
    const [first] = problems;
    super(first.message, {
      ...(path !== undefined ? { path } : {}),
      ...(first.line !== undefined ? { line: first.line } : {}),
      ...(first.hint !== undefined ? { hint: first.hint } : {}),
    });
    this.name = "ScriptError";
    this.problems = problems;
  }
}

/**
 * The deck a script.md describes. Every problem is collected before any is thrown: the
 * frontmatter and each heading are read on their own, and a heading that cannot be read still
 * opens its section, so the beats under it are not reported as well.
 */
export function parseScript(source: string, filename?: string): Deck {
  const problems: ScriptProblem[] = [];
  const { yaml, body, bodyStartLine } = splitFrontmatter(source, filename);
  const frontmatter = collect(problems, () => parseFrontmatter(yaml, filename));
  const sections = parseSections(body, bodyStartLine, problems);

  if (frontmatter !== undefined && problems.length === 0) {
    const lang = frontmatter.lang ?? inferLang(`${frontmatter.title}\n${body}`);
    const result = Deck.safeParse({ ...frontmatter, lang, sections });
    if (result.success) {
      return result.data;
    }
    problems.push({ message: formatZodIssues(result.error) });
  }
  // A frontmatter that was not read left its problem, so there is always a first one.
  const [first = { message: "script.md could not be read" }, ...rest] = problems;
  throw new ScriptError([first, ...rest], filename);
}

/** `read`'s value, or undefined with its DekcError kept as a problem. */
function collect<T>(problems: ScriptProblem[], read: () => T): T | undefined {
  try {
    return read();
  } catch (error) {
    if (!(error instanceof DekcError)) {
      throw error;
    }
    problems.push({
      message: error.message,
      ...(error.line !== undefined ? { line: error.line } : {}),
      ...(error.hint !== undefined ? { hint: error.hint } : {}),
    });
    return undefined;
  }
}

/** A script.md cut at its frontmatter fences; the YAML starts on line 2. */
export type ScriptParts = { yaml: string; body: string; bodyStartLine: number };

export function splitFrontmatter(source: string, filename?: string): ScriptParts {
  const lines = splitLines(source);
  if (lines[0]?.trim() !== "---") {
    throw new DekcError("script.md must start with YAML frontmatter", {
      line: 1,
      path: filename,
      hint: "start it with three lines: ---, title: Your talk, ---",
    });
  }

  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === "---") {
      return {
        yaml: lines.slice(1, i).join("\n"),
        body: lines.slice(i + 1).join("\n"),
        bodyStartLine: i + 2,
      };
    }
  }

  throw new DekcError("YAML frontmatter is not closed", { line: 1, path: filename });
}

/** The frontmatter's YAML as a value, before the schema reads it; a syntax error throws. */
export function readFrontmatterYaml(yaml: string): unknown {
  return Bun.YAML.parse(quoteUnquotedHashes(yaml));
}

function parseFrontmatter(yaml: string, filename?: string): Frontmatter {
  let parsed: unknown;
  try {
    parsed = readFrontmatterYaml(yaml);
  } catch (error) {
    throw new DekcError(`invalid YAML frontmatter: ${parseFailure(error)}`, {
      path: filename,
      cause: error,
      hint: configHint("frontmatter"),
    });
  }

  const result = Frontmatter.safeParse(parsed);
  if (!result.success) {
    throw new DekcError(formatZodIssues(result.error), {
      path: filename,
      hint: configHint("frontmatter"),
    });
  }
  return result.data;
}

/** Keep values like `Meetup #42` intact; YAML would otherwise treat `#` as a comment. */
function quoteUnquotedHashes(yaml: string): string {
  return splitLines(yaml)
    .map((line) => {
      if (/^\s*#/.test(line) || !line.includes("#")) {
        return line;
      }
      const match = line.match(YAML_PAIR_RE);
      if (!match) {
        return line;
      }
      let value = (match[3] ?? "").trimEnd();
      if (!value || /^["'[{]/.test(value)) {
        return line;
      }
      const comment = value.match(/^(.*) # .+$/);
      if (comment) {
        value = (comment[1] ?? "").trimEnd();
        if (!value) {
          return line;
        }
      }
      const prefix = `${match[1] ?? ""}${match[2] ?? ""}`;
      return `${prefix}${JSON.stringify(value)}`;
    })
    .join("\n");
}

function parseSections(body: string, startLine: number, problems: ScriptProblem[]): Section[] {
  const sections: Section[] = [];
  let current: DraftSection | undefined;
  let bodyLines: string[] = [];

  const flushBody = (): string => {
    const text = bodyLines.join("\n").replace(/^\n+/, "").replace(/\n+$/, "");
    bodyLines = [];
    return text;
  };

  const finishBeat = (): void => {
    if (!current?.beat) {
      return;
    }
    current.beats.push({ ...current.beat, body: flushBody() });
    current.beat = undefined;
  };

  const finishSection = (): void => {
    if (!current) {
      return;
    }
    finishBeat();
    if (current.beats.length === 0) {
      current.body = flushBody();
    }
    sections.push({
      slug: current.slug,
      title: current.title,
      body: current.body,
      beats: current.beats,
      line: current.line,
    });
    current = undefined;
  };

  for (const [i, { text: line, literal }] of scriptLines(body).entries()) {
    const lineNumber = startLine + i;
    const heading = literal ? null : line.match(HEADING_RE);
    if (!heading) {
      bodyLines.push(line);
      continue;
    }

    const hashes = heading[1] ?? "";
    const text = heading[2] ?? "";
    if (hashes === "##") {
      finishSection();
      const parsed = collect(problems, () =>
        parseHeading(text, lineNumber, { idRequired: true, hashes }),
      );
      // A heading that cannot be read still opens its section, so its beats are not reported too.
      current = {
        slug: parsed?.id ?? "",
        title: parsed?.title ?? text.trim(),
        body: "",
        beats: [],
        line: lineNumber,
      };
      continue;
    }

    if (!current) {
      problems.push({ message: "### beat is not inside a ## section", line: lineNumber });
      continue;
    }
    finishBeat();
    if (current.beats.length === 0) {
      current.body = flushBody();
    }
    const parsed = collect(problems, () =>
      parseHeading(text, lineNumber, { idRequired: false, hashes }),
    );
    current.beat = {
      ...(parsed?.id ? { id: parsed.id } : {}),
      title: parsed?.title ?? text.trim(),
      line: lineNumber,
    };
  }

  finishSection();
  return sections;
}

type DraftSection = {
  slug: string;
  title: string;
  body: string;
  beats: Beat[];
  line: number;
  beat?: { id?: string; title: string; line: number };
};

function parseHeading(
  text: string,
  line: number,
  options: { idRequired: true; hashes: string },
): { title: string; id: string };
function parseHeading(
  text: string,
  line: number,
  options: { idRequired: false; hashes: string },
): { title: string; id?: string };
function parseHeading(
  text: string,
  line: number,
  options: { idRequired: boolean; hashes: string },
): { title: string; id?: string } {
  const attrMatch = text.match(TRAILING_ATTR_RE);
  if (attrMatch) {
    const title = (attrMatch[1] ?? "").trim();
    const attrs = attrMatch[2] ?? "";
    const idMatch = attrs.match(ID_ATTR_RE);
    const id = idMatch?.[1];
    if (!id || !Id.safeParse(id).success) {
      throw new DekcError("heading attribute must be {#id}", {
        line,
        hint: headingIdHint(options.hashes, title, attrs.trim().match(/^#(.+)$/)?.[1]),
      });
    }
    return { title, id };
  }

  const title = text.trim();
  if (Id.safeParse(title).success) {
    return { title, id: title };
  }
  if (options.idRequired) {
    throw new DekcError("heading requires {#id}", {
      line,
      hint: headingIdHint(options.hashes, title),
    });
  }
  return { title };
}

/** An id built from the ASCII words of `source`, when it has any letters. */
function suggestId(source: string): string | undefined {
  const id = source
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.join("-");
  return id && Id.safeParse(id).success ? id : undefined;
}

function headingIdHint(hashes: string, title: string, given?: string): string {
  const id = (given && suggestId(given)) ?? suggestId(title);
  return id
    ? `write it as \`${hashes} ${title} {#${id}}\``
    : `write it as \`${hashes} ${title} {#your-id}\`; ids use a-z, 0-9, and -`;
}
