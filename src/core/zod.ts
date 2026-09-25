import type { z } from "zod";

const REFERENCE = "https://hajimism.github.io/dek/reference/config.html";

/** Where the keys of a config file are documented, as a hint. */
export function configHint(
  anchor: "dek-toml" | "frontmatter" | "voice-voice-toml" | "voice-dict-toml",
): string {
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
