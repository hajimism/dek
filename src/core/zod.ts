import type { z } from "zod";

const REFERENCE = "https://hajimism.github.io/dek/reference/config.html";

/** Where the keys of a config file are documented, as a hint. */
export function configHint(
  anchor: "dek-toml" | "frontmatter" | "voice-voice-toml" | "voice-dict-toml",
): string {
  return `see ${REFERENCE}#${anchor}`;
}

/**
 * A parser's syntax error in its own words, without the class name or banner Bun puts in front,
 * and the 1-based line it points at when the parser says. Bun 1.4's TOML parser says no line.
 */
export function parseFailure(error: unknown): { text: string; line?: number } {
  const text = (error instanceof Error ? error.message : String(error)).replace(
    /^(?:(?:BuildMessage|SyntaxError): )?(?:TOML Parse error: )?/,
    "",
  );
  const line = (error as { position?: { line?: unknown } } | null)?.position?.line;
  return typeof line === "number" && line > 0 ? { text, line } : { text };
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
