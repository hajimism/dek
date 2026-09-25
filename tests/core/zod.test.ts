import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { formatZodIssues, parseFailure } from "../../src/core/zod.ts";

describe("formatZodIssues", () => {
  test("prefixes the message with the dotted path", () => {
    const r = z.object({ title: z.string() }).safeParse({});
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(formatZodIssues(r.error)).toBe("title: required");
  });

  test("joins multiple issues with '; ' and keeps nested paths", () => {
    const r = z
      .object({ voice: z.object({ speaker: z.string(), speed: z.number() }) })
      .safeParse({ voice: { speed: "fast" } });
    if (r.success) return;
    const text = formatZodIssues(r.error);
    expect(text).toContain("voice.speaker: ");
    expect(text).toContain("voice.speed: ");
    expect(text.split("; ")).toHaveLength(2);
  });

  test("omits the path prefix for a root issue", () => {
    const r = z.string().safeParse(1);
    if (r.success) return;
    expect(formatZodIssues(r.error)).not.toContain(": :");
    expect(formatZodIssues(r.error).startsWith("Invalid input")).toBe(true);
  });
});

// Both shapes Bun's TOML parser throws, built by hand so the test holds on any Bun.
describe("parseFailure", () => {
  test("Bun 1.3: a BuildMessage with a position", () => {
    const error = Object.assign(new Error("BuildMessage: Unexpected end of file"), {
      position: { line: 2 },
    });
    expect(parseFailure(error)).toEqual({ text: "Unexpected end of file", line: 2 });
  });

  test("Bun 1.4: a SyntaxError with a parser banner and no position", () => {
    // Its own `line` is where the parse was called in JavaScript, not a line of the file.
    const error = Object.assign(
      new SyntaxError("TOML Parse error: Cannot redefine table 'beats'"),
      { line: 1, column: 16 },
    );
    expect(parseFailure(error)).toEqual({ text: "Cannot redefine table 'beats'" });
  });
});
