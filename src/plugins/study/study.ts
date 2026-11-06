import { STUDY_FILE } from "./manifest.ts";
import { parseYaml, YamlError } from "./yaml.ts";

/** One sticker: it hides `quote` on `slide`, at the place `prefix` comes right before. */
export type Sticker = {
  id: string;
  slide: string;
  quote: string;
  prefix?: string;
  /** Where the sticker starts in study.yaml. */
  line: number;
};

/** What is wrong with study.yaml, and the line to look at. */
export type Problem = { message: string; line: number };

const VERSION = 1;

/** What YAML made of words written without quotes, when it made them something other than text. */
function unquoted(value: unknown): string | undefined {
  if (typeof value === "number") {
    return `the number ${value}`;
  }
  return typeof value === "boolean" ? String(value) : undefined;
}

/**
 * The stickers in study.yaml, and what keeps the rest from being used. A sticker with a problem
 * is left out, so the checks run on every sticker that can be read. The page reads it the same.
 */
export function readStudy(source: string): { stickers: Sticker[]; problems: Problem[] } {
  let parsed: ReturnType<typeof parseYaml>;
  try {
    parsed = parseYaml(source);
  } catch (error) {
    if (error instanceof YamlError) {
      return {
        stickers: [],
        problems: [
          {
            message: `${STUDY_FILE} is not YAML dek-study reads: ${error.message}`,
            line: error.line,
          },
        ],
      };
    }
    throw error;
  }
  const { value, lineOf } = parsed;
  if (value === null) {
    return { stickers: [], problems: [] };
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    return { stickers: [], problems: [{ message: `${STUDY_FILE} is not a mapping`, line: 1 }] };
  }
  const top = lineOf(value) ?? 1;
  const fields = value as { version?: unknown; stickers?: unknown };
  const lines = source.split("\n");
  const keyLine = (key: string) => {
    const index = lines.findIndex((text) => new RegExp(`^${key}\\s*:`).test(text));
    return index === -1 ? top : index + 1;
  };
  if (fields.version !== VERSION) {
    return {
      stickers: [],
      problems: [
        {
          message: `${STUDY_FILE} is version ${String(fields.version)}; this dek-study reads version ${VERSION}`,
          line: keyLine("version"),
        },
      ],
    };
  }
  if (fields.stickers === undefined || fields.stickers === null) {
    return { stickers: [], problems: [] };
  }
  if (!Array.isArray(fields.stickers)) {
    return {
      stickers: [],
      problems: [{ message: "`stickers` is not a list", line: keyLine("stickers") }],
    };
  }

  const stickers: Sticker[] = [];
  const problems: Problem[] = [];
  const seen = new Set<string>();
  fields.stickers.forEach((entry: unknown, index) => {
    const sticker =
      typeof entry === "object" && entry !== null ? (entry as Record<string, unknown>) : null;
    const line = (sticker && lineOf(sticker)) ?? keyLine("stickers");
    const id = typeof sticker?.id === "string" && sticker.id !== "" ? sticker.id : undefined;
    const name = id ?? `#${index + 1}`;
    for (const key of ["id", "slide", "quote", "prefix"] as const) {
      const made = unquoted(sticker?.[key]);
      if (made !== undefined) {
        problems.push({
          message: `sticker ${name}: YAML reads its \`${key}\` as ${made}; put it in quotes`,
          line,
        });
        return;
      }
    }
    if (id === undefined) {
      problems.push({ message: `sticker ${name} has no \`id\``, line });
      return;
    }
    for (const key of ["slide", "quote"] as const) {
      const value = sticker?.[key];
      if (typeof value !== "string" || value.trim() === "") {
        problems.push({ message: `sticker ${name} has no \`${key}\``, line });
        return;
      }
    }
    if (sticker?.prefix !== undefined && typeof sticker.prefix !== "string") {
      problems.push({ message: `sticker ${name}'s \`prefix\` is not text`, line });
      return;
    }
    if (seen.has(id)) {
      problems.push({
        message: `sticker ${id} is named twice; give each sticker its own id`,
        line,
      });
      return;
    }
    seen.add(id);
    stickers.push({
      id,
      slide: sticker?.slide as string,
      quote: sticker?.quote as string,
      ...(typeof sticker?.prefix === "string" && sticker.prefix !== ""
        ? { prefix: sticker.prefix }
        : {}),
      line,
    });
  });
  return { stickers, problems };
}
