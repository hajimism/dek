import { afterEach, describe, expect, test } from "bun:test";
import { displayWidth, padEndWidth, shouldColor, truncateWidth, wrap } from "../../src/cli/tty.ts";

const envKeys = ["NO_COLOR", "FORCE_COLOR", "CI"] as const;
const saved = new Map<string, string | undefined>();

function stashEnv(): void {
  for (const key of envKeys) {
    saved.set(key, process.env[key]);
  }
}

function restoreEnv(): void {
  for (const key of envKeys) {
    const value = saved.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function clearColorEnv(): void {
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
  delete process.env.CI;
}

stashEnv();
afterEach(restoreEnv);

describe("displayWidth", () => {
  test("counts CJK as two columns and ignores ANSI", () => {
    expect(displayWidth("HTML スライドツールを作った話")).toBe(29);
    expect(displayWidth("あ")).toBe(2);
    expect(displayWidth("\x1b[31mhello\x1b[0m")).toBe(5);
  });
});

describe("padEndWidth", () => {
  test("pads to a display width, including CJK", () => {
    expect(padEndWidth("Demo", 10)).toBe("Demo      ");
    expect(padEndWidth("あ", 4)).toBe("あ  ");
  });
});

describe("truncateWidth", () => {
  test("leaves short ASCII unchanged", () => {
    expect(truncateWidth("demo", 10)).toBe("demo");
  });

  test("truncates CJK to a display width with an ellipsis", () => {
    const truncated = truncateWidth("日本語タイトル", 8);
    expect(displayWidth(truncated)).toBeLessThanOrEqual(8);
    expect(truncated.endsWith("...")).toBe(true);
    expect(truncated.startsWith("日")).toBe(true);
  });
});

describe("shouldColor", () => {
  test.serial("NO_COLOR wins even on a TTY", () => {
    clearColorEnv();
    process.env.NO_COLOR = "1";
    expect(shouldColor({ isTTY: true })).toBe(false);
  });

  test.serial("FORCE_COLOR wins even when not a TTY", () => {
    clearColorEnv();
    process.env.FORCE_COLOR = "1";
    expect(shouldColor({ isTTY: false })).toBe(true);
  });

  test.serial("CI disables color without FORCE_COLOR", () => {
    clearColorEnv();
    process.env.CI = "1";
    expect(shouldColor({ isTTY: true })).toBe(false);
  });

  test.serial("TTY enables color when no env overrides are set", () => {
    clearColorEnv();
    expect(shouldColor({ isTTY: true })).toBe(true);
    expect(shouldColor({ isTTY: false })).toBe(false);
  });
});

describe("wrap", () => {
  test.serial("wraps red on a TTY", () => {
    clearColorEnv();
    const colored = wrap({ isTTY: true }).red("x");
    expect(colored).toContain("\x1b[31m");
    expect(colored).toContain("x");
    expect(colored).toContain("\x1b[0m");
  });

  test.serial("is a no-op when not a TTY", () => {
    clearColorEnv();
    expect(wrap({ isTTY: false }).red("x")).toBe("x");
  });
});
