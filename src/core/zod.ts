import type { z } from "zod";
import { DekError } from "./error.ts";

const REFERENCE = "https://hajimism.github.io/dek/reference/config.html";

type ConfigAnchor = "dek-toml" | "frontmatter" | "voice-voice-toml" | "voice-dict-toml";

/** Where the keys of a config file are documented, as a hint. */
export function configHint(anchor: ConfigAnchor): string {
  return `see ${REFERENCE}#${anchor}`;
}

/**
 * A parser's syntax error in its own words, without the class name or banner Bun puts in front.
 * Bun's parsers say no line of the file: the error's own `line` is where JavaScript called them.
 */
export function parseFailure(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(
    /^(?:SyntaxError: )?(?:TOML Parse error: )?/,
    "",
  );
}

export function formatZodIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      // "expected string, received undefined" says less than "required".
      const message =
        issue.code === "invalid_type" && /received undefined$/.test(issue.message)
          ? "required"
          : issue.message;
      return path ? `${path}: ${message}` : message;
    })
    .join("; ");
}

/**
 * A TOML file read through `schema`: a syntax error names the file, a schema issue names the key,
 * and both point at where the file's keys are documented.
 */
export function parseTomlWith<S extends z.ZodType>(
  schema: S,
  source: string,
  where: { label: string; anchor: ConfigAnchor; path?: string },
): z.output<S> {
  const hint = configHint(where.anchor);
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(source);
  } catch (error) {
    throw new DekError(`invalid ${where.label}: ${parseFailure(error)}`, {
      path: where.path,
      cause: error,
      hint,
    });
  }
  const result = schema.safeParse(parsed ?? {});
  if (!result.success) {
    throw new DekError(formatZodIssues(result.error), { path: where.path, hint });
  }
  return result.data;
}

/**
 * The keys of `value` that a strict `schema` does not know, each as its full path. Parsing with
 * the lenient schema drops them without a word; this is how lint hears of them.
 */
export function unrecognizedKeys(schema: z.ZodType, value: unknown): string[][] {
  const result = schema.safeParse(value);
  if (result.success) {
    return [];
  }
  return result.error.issues.flatMap((issue) =>
    issue.code === "unrecognized_keys"
      ? issue.keys.map((key) => [...issue.path.map(String), key])
      : [],
  );
}
