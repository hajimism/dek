import { DekError } from "./error.ts";
import { splitLines } from "./lines.ts";
import { type Beat, Deck, Frontmatter, Id, inferLang, type Section } from "./schema.ts";
import { configHint, formatZodIssues, parseFailure } from "./zod.ts";

const HEADING_RE = /^(#{2,3})(?!#)\s+(.*)$/;
const TRAILING_ATTR_RE = /^(.*?)\s*\{([^}]*)\}\s*$/;
const ID_ATTR_RE = /^#([a-z0-9-]+)$/;
const YAML_PAIR_RE = /^(\s*[\w-]+\s*:)(\s*)(.*)$/;

export function parseScript(source: string, filename?: string): Deck {
  const { yaml, body, bodyStartLine } = splitFrontmatter(source, filename);
  const frontmatter = parseFrontmatter(yaml, filename);
  const sections = parseSections(body, bodyStartLine, filename);

  const lang = frontmatter.lang ?? inferLang(`${frontmatter.title}\n${body}`);
  const result = Deck.safeParse({ ...frontmatter, lang, sections });
  if (!result.success) {
    throw new DekError(formatZodIssues(result.error), { path: filename });
  }
  return result.data;
}

function splitFrontmatter(
  source: string,
  filename?: string,
): { yaml: string; body: string; bodyStartLine: number } {
  const lines = splitLines(source);
  if (lines[0]?.trim() !== "---") {
    throw new DekError("script.md must start with YAML frontmatter", {
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

  throw new DekError("YAML frontmatter is not closed", { line: 1, path: filename });
}

function parseFrontmatter(yaml: string, filename?: string): Frontmatter {
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(quoteUnquotedHashes(yaml));
  } catch (error) {
    throw new DekError(`invalid YAML frontmatter: ${parseFailure(error)}`, {
      path: filename,
      cause: error,
      hint: configHint("frontmatter"),
    });
  }

  const result = Frontmatter.safeParse(parsed);
  if (!result.success) {
    throw new DekError(formatZodIssues(result.error), {
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

function parseSections(body: string, startLine: number, filename?: string): Section[] {
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

  const lines = splitLines(body);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNumber = startLine + i;
    const heading = line.match(HEADING_RE);
    if (!heading) {
      bodyLines.push(line);
      continue;
    }

    const hashes = heading[1] ?? "";
    const text = heading[2] ?? "";
    if (hashes === "##") {
      finishSection();
      const parsed = parseHeading(text, lineNumber, { idRequired: true, filename, hashes });
      current = {
        slug: parsed.id,
        title: parsed.title,
        body: "",
        beats: [],
        line: lineNumber,
      };
      continue;
    }

    if (!current) {
      throw new DekError("### beat is not inside a ## section", {
        line: lineNumber,
        path: filename,
      });
    }
    finishBeat();
    if (current.beats.length === 0) {
      current.body = flushBody();
    }
    const parsed = parseHeading(text, lineNumber, { idRequired: false, filename, hashes });
    current.beat = { id: parsed.id, title: parsed.title, line: lineNumber };
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
  options: { idRequired: true; filename?: string; hashes: string },
): { title: string; id: string };
function parseHeading(
  text: string,
  line: number,
  options: { idRequired: false; filename?: string; hashes: string },
): { title: string; id?: string };
function parseHeading(
  text: string,
  line: number,
  options: { idRequired: boolean; filename?: string; hashes: string },
): { title: string; id?: string } {
  const attrMatch = text.match(TRAILING_ATTR_RE);
  if (attrMatch) {
    const title = (attrMatch[1] ?? "").trim();
    const attrs = attrMatch[2] ?? "";
    const idMatch = attrs.match(ID_ATTR_RE);
    const id = idMatch?.[1];
    if (!id || !Id.safeParse(id).success) {
      throw new DekError("heading attribute must be {#id}", {
        line,
        path: options.filename,
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
    throw new DekError("heading requires {#id}", {
      line,
      path: options.filename,
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
