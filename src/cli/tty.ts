export type ColorStream = { isTTY?: boolean };

const reset = "\x1b[0m";
const codes = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
} as const;

/** The codes dek's own palette writes, which are all terminalSafe lets through. */
const PALETTE = new Set<string>([reset, ...Object.values(codes)]);

/**
 * Text with no control character but a newline and a tab: each other shows as U+FFFD, the escape
 * that starts a color code included. A result's and an error's text go through it before dek
 * paints them, so what a deck or a ref wrote carries no color, conceal, or cursor move of its own.
 */
export function plainText(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
  return text.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, "\uFFFD");
}

/**
 * Text for a terminal: dek's own colors, newlines, and tabs pass, and every other control
 * character shows as U+FFFD. A deck title, a file name, or a ref's title fetched from GitHub
 * could otherwise set the window title, draw a fake link (OSC 8), clear the screen, or hide
 * itself from a person while an agent reading the bytes sees it, as conceal (SGR 8) does.
 */
export function terminalSafe(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
  return text.replace(/\x1b\[[0-9;]*m|[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, (match) =>
    PALETTE.has(match) ? match : plainText(match),
  );
}

export function shouldColor(stream: ColorStream): boolean {
  if (process.env.NO_COLOR) {
    return false;
  }
  if (process.env.FORCE_COLOR) {
    return true;
  }
  if (process.env.CI) {
    return false;
  }
  return stream.isTTY === true;
}

function paint(enabled: boolean, code: string, text: string): string {
  if (!enabled) {
    return text;
  }
  return `${code}${text}${reset}`;
}

export function ansi(enabled: boolean): {
  red(s: string): string;
  yellow(s: string): string;
  green(s: string): string;
  cyan(s: string): string;
  dim(s: string): string;
  bold(s: string): string;
} {
  return {
    red: (s) => paint(enabled, codes.red, s),
    yellow: (s) => paint(enabled, codes.yellow, s),
    green: (s) => paint(enabled, codes.green, s),
    cyan: (s) => paint(enabled, codes.cyan, s),
    dim: (s) => paint(enabled, codes.dim, s),
    bold: (s) => paint(enabled, codes.bold, s),
  };
}

export function displayWidth(s: string): number {
  return Bun.stringWidth(s);
}

export function padEndWidth(s: string, width: number): string {
  const extra = width - displayWidth(s);
  if (extra <= 0) {
    return s;
  }
  return `${s}${" ".repeat(extra)}`;
}

export function padStartWidth(s: string, width: number): string {
  const extra = width - displayWidth(s);
  if (extra <= 0) {
    return s;
  }
  return `${" ".repeat(extra)}${s}`;
}
