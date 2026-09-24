import type { z } from "zod";

const REFERENCE = "https://hajimism.github.io/dek/reference/config.html";

/** Where the keys of a config file are documented, as a hint. */
export function configHint(
  anchor: "dek-toml" | "frontmatter" | "voice-voice-toml" | "voice-dict-toml",
): string {
  return `see ${REFERENCE}#${anchor}`;
}

/** The parser's own words for a syntax error, so the message says where it is. */
export function causeText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
