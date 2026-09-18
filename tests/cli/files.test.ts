import { describe, expect, test } from "bun:test";
import { defaultScript } from "../../src/cli/files.ts";
import { parseScript } from "../../src/core/index.ts";

describe("defaultScript", () => {
  test("quotes titles that would break YAML", () => {
    const title = "Meetup: #42";
    const source = defaultScript(title);
    expect(source).toContain(`title: ${JSON.stringify(title)}`);
    const deck = parseScript(source);
    expect(deck.title).toBe(title);
  });
});
