import { describe, expect, it } from "vitest";
import { langHref } from "../../src/shell/lang-link.ts";
import { Theme } from "../../src/shell/type.ts";

describe("langHref", () => {
  it("keeps the path, the rest of the query and the fragment", () => {
    expect(langHref(new URL("http://x/@demo/talk?user_code=AB&lang=en#c_1"), "ja")).toBe(
      "/@demo/talk?user_code=AB&lang=ja#c_1",
    );
  });
});

describe("Theme", () => {
  it("reads the theme cookie, and anything else as the system's", () => {
    expect(Theme.parse("dark")).toBe("dark");
    expect(Theme.parse("light")).toBe("light");
    expect(Theme.parse("sepia")).toBe("system");
    expect(Theme.parse(undefined)).toBe("system");
  });
});
