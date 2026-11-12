import { describe, expect, test } from "bun:test";
import { withFrontmatterKey } from "../../src/core/frontmatter-key.ts";
import { parseScript } from "../../src/core/parse.ts";

const ID = "d_0123456789ab";

describe("withFrontmatterKey", () => {
  test("adds the key last in the frontmatter and leaves the rest as it was", () => {
    const source =
      "---\n# yaml-language-server: $schema=../../.dek/schema.json\ntitle: Talk\n---\n\n## intro\n\nhello\n";
    expect(withFrontmatterKey(source, "pub", ID)).toBe(
      `---\n# yaml-language-server: $schema=../../.dek/schema.json\ntitle: Talk\npub: ${ID}\n---\n\n## intro\n\nhello\n`,
    );
  });

  test("replaces the key where it is, with the lines that continue its value", () => {
    const source = "---\ntitle: Talk\npub:\n  d_aaaaaaaaaa\nlang: en\n---\nbody\n";
    expect(withFrontmatterKey(source, "pub", ID)).toBe(
      `---\ntitle: Talk\npub: ${ID}\nlang: en\n---\nbody\n`,
    );
  });

  test("replaces only the top-level key, not one nested or named alike", () => {
    const source = "---\ntitle: Talk\npublic: yes\n  pub: nested\npub: d_aaaaaaaaaa\n---\n";
    expect(withFrontmatterKey(source, "pub", ID)).toBe(
      `---\ntitle: Talk\npublic: yes\n  pub: nested\npub: ${ID}\n---\n`,
    );
  });

  test("keeps CRLF line ends, a byte order mark, and a body with no final newline", () => {
    const source = "﻿---\r\ntitle: Talk\r\n---\r\n\r\n## intro\r\n\r\nhello";
    expect(withFrontmatterKey(source, "pub", ID)).toBe(
      `﻿---\r\ntitle: Talk\r\npub: ${ID}\r\n---\r\n\r\n## intro\r\n\r\nhello`,
    );
  });

  test("gives a script with no frontmatter one", () => {
    expect(withFrontmatterKey("## intro\n", "pub", ID)).toBe(`---\npub: ${ID}\n---\n\n## intro\n`);
    expect(withFrontmatterKey("", "pub", ID)).toBe(`---\npub: ${ID}\n---\n`);
  });

  test("refuses a frontmatter that is not closed", () => {
    expect(() => withFrontmatterKey("---\ntitle: Talk\n", "pub", ID)).toThrow(
      "YAML frontmatter is not closed",
    );
  });

  test("writes a script that parses with the key", () => {
    const written = withFrontmatterKey("---\ntitle: Talk\n---\n\n## intro\n\nhello\n", "pub", ID);
    expect(parseScript(written).pub).toBe(ID);
  });
});

describe("pub in the frontmatter", () => {
  test("is refused unless it looks like a deck ID, with what to write", () => {
    expect(() => parseScript("---\ntitle: Talk\npub: talk\n---\n\n## intro\n")).toThrow(
      "write the ID dek.pub gave the deck",
    );
  });
});
