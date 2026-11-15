import { DekError } from "./error.ts";

const FENCE = "---";

/**
 * `source` with the top-level `key` of its frontmatter set to `value`, every other byte as it was:
 * a `key:` line already there is replaced, with any indented lines that continue its value, and
 * a new one goes last, before the closing fence. A script with no frontmatter gains one. The line
 * ends the file uses are kept. `value` is written as it is, so it must be a plain YAML scalar.
 */
export function withFrontmatterKey(source: string, key: string, value: string): string {
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const text = source.slice(bom.length);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const entry = `${key}: ${value}`;
  const found = locate(text, key);
  if (found === undefined) {
    return `${bom}${FENCE}${eol}${entry}${eol}${FENCE}${eol}${text === "" ? "" : eol}${text}`;
  }
  const { lines, close, at, end } = found;
  if (at < 0) {
    return `${bom}${[...lines.slice(0, close), `${entry}${eol}`, ...lines.slice(close)].join("")}`;
  }
  const ending = lines[at]?.endsWith("\r\n") ? "\r\n" : "\n";
  return `${bom}${[...lines.slice(0, at), `${entry}${ending}`, ...lines.slice(end)].join("")}`;
}

/**
 * `source` without the top-level `key` of its frontmatter, nor the indented lines that continue
 * its value, every other byte as it was. A script without the key, or with no frontmatter, is
 * given back as it is.
 */
export function withoutFrontmatterKey(source: string, key: string): string {
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const found = locate(source.slice(bom.length), key);
  if (found === undefined || found.at < 0) {
    return source;
  }
  const { lines, at, end } = found;
  return `${bom}${[...lines.slice(0, at), ...lines.slice(end)].join("")}`;
}

/**
 * The lines of `text`, each with its own ending, so joining them gives back the text byte for
 * byte; the index of the frontmatter's closing fence; and the lines `key` takes, from `at` up to
 * `end`, with `at` -1 when the frontmatter has no such key. Undefined when there is no
 * frontmatter.
 */
function locate(
  text: string,
  key: string,
): { lines: string[]; close: number; at: number; end: number } | undefined {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (content(lines[0]) !== FENCE) {
    return undefined;
  }
  const close = lines.findIndex((line, index) => index > 0 && content(line) === FENCE);
  if (close < 0) {
    throw new DekError("YAML frontmatter is not closed", {
      line: 1,
      hint: "end the frontmatter with a line of three dashes, ---",
    });
  }
  const own = new RegExp(`^${escapeRegExp(key)}\\s*:`);
  const at = lines.findIndex((line, index) => index > 0 && index < close && own.test(line));
  let end = at + 1;
  while (at >= 0 && end < close && /^[ \t]+\S/.test(lines[end] ?? "")) {
    end += 1;
  }
  return { lines, close, at, end };
}

/** A line without its ending or the spaces around it. */
function content(line: string | undefined): string | undefined {
  return line?.trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
