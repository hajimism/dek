import { describe, expect, test } from "bun:test";
import { ansi, displayWidth, padEndWidth, shouldColor, terminalSafe } from "../../src/cli/tty.ts";
import { withEnv } from "../helpers/env.ts";

/** The color variables unset, then `env` on top: each case starts from a clean slate. */
function withColorEnv(env: Record<string, string>, fn: () => void): Promise<void> {
  return withEnv({ NO_COLOR: undefined, FORCE_COLOR: undefined, CI: undefined, ...env }, async () =>
    fn(),
  );
}

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

describe("shouldColor", () => {
  test("NO_COLOR wins even on a TTY", async () => {
    await withColorEnv({ NO_COLOR: "1", FORCE_COLOR: "1" }, () => {
      expect(shouldColor({ isTTY: true })).toBe(false);
    });
  });

  test("FORCE_COLOR wins even when not a TTY", async () => {
    await withColorEnv({ FORCE_COLOR: "1", CI: "1" }, () => {
      expect(shouldColor({ isTTY: false })).toBe(true);
    });
  });

  test("CI disables color without FORCE_COLOR", async () => {
    await withColorEnv({ CI: "1" }, () => {
      expect(shouldColor({ isTTY: true })).toBe(false);
    });
  });

  test("TTY enables color when no env overrides are set", async () => {
    await withColorEnv({}, () => {
      expect(shouldColor({ isTTY: true })).toBe(true);
      expect(shouldColor({ isTTY: false })).toBe(false);
    });
  });
});

describe("ansi", () => {
  test("wraps red when enabled, and is a no-op when not", () => {
    expect(ansi(true).red("x")).toBe("\x1b[31mx\x1b[0m");
    expect(ansi(false).red("x")).toBe("x");
  });
});

describe("terminalSafe", () => {
  test("keeps dekc's colors, newlines, and tabs", () => {
    const text = "\x1b[31merror\x1b[0m\tscript.md\n  \x1b[2mhint\x1b[0m";
    expect(terminalSafe(text)).toBe(text);
  });

  test("shows any other control a file name or a fetched title could carry, instead of obeying it", () => {
    // A fake hyperlink (OSC 8), a window title (OSC 0), a clear screen, and a carriage return
    // that would print over the line before it.
    const hostile =
      "\x1b]8;;https://attacker.example\x07click\x1b]8;;\x07 \x1b]0;pwned\x07\x1b[2J\rok\x9b";
    expect(terminalSafe(hostile)).toBe(
      "\uFFFD]8;;https://attacker.example\uFFFDclick\uFFFD]8;;\uFFFD \uFFFD]0;pwned\uFFFD\uFFFD[2J\uFFFDok\uFFFD",
    );
  });
});
