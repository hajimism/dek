import { describe, expect, test } from "bun:test";
import { setTableKey } from "../../src/core/toml-keys.ts";

const SHA = "a".repeat(40);

describe("setTableKey", () => {
  test("adds a table at the end when there is none, keeping the rest byte for byte", () => {
    expect(setTableKey("# dek project\nmax_classes = 40\n", "refs", "o/r/d", SHA)).toBe(
      `# dek project\nmax_classes = 40\n\n[refs]\n"o/r/d" = "${SHA}"\n`,
    );
    expect(setTableKey("", "refs", "o/r/d", SHA)).toBe(`[refs]\n"o/r/d" = "${SHA}"\n`);
    expect(setTableKey("max_classes = 40", "refs", "o/r/d", SHA)).toBe(
      `max_classes = 40\n\n[refs]\n"o/r/d" = "${SHA}"\n`,
    );
  });

  test("adds a key after the table's last key, before the next table", () => {
    const source = `[refs]\n"a/b/c" = "x" # house deck\n\n[voice]\nspeaker = "s"\n`;
    expect(setTableKey(source, "refs", "o/r/d", SHA)).toBe(
      `[refs]\n"a/b/c" = "x" # house deck\n"o/r/d" = "${SHA}"\n\n[voice]\nspeaker = "s"\n`,
    );
  });

  test("replaces only the value of an existing key", () => {
    const source = `[refs]\n  "o/r/d" = "old"   # pinned for the talk\n`;
    expect(setTableKey(source, "refs", "o/r/d", SHA)).toBe(
      `[refs]\n  "o/r/d" = "${SHA}"   # pinned for the talk\n`,
    );
  });

  test("removes a key, and the table once it holds no keys", () => {
    const two = `max = 1\n\n[refs]\n"a/b/c" = "x"\n"o/r/d" = "y"\n`;
    expect(setTableKey(two, "refs", "o/r/d", undefined)).toBe(`max = 1\n\n[refs]\n"a/b/c" = "x"\n`);
    const one = `max = 1\n\n[refs]\n"o/r/d" = "y"\n\n[voice]\nspeaker = "s"\n`;
    expect(setTableKey(one, "refs", "o/r/d", undefined)).toBe(
      `max = 1\n\n[voice]\nspeaker = "s"\n`,
    );
  });

  test("removing a key that is not there changes nothing", () => {
    expect(setTableKey("max = 1\n", "refs", "o/r/d", undefined)).toBe("max = 1\n");
  });
});
