import { DekError } from "./error.ts";

const FENCE = "---";

/**
 * `source` with the top-level `key` of its frontmatter set to `value`, every other byte as it was:
 * a `key:` line already there is replaced, with any indented lines that continue its value, and
 * a new one goes last, before the closing fence. A script with no frontmatter gains one. The line
 * ends the file uses are kept. `value` is written as it is, so it must be a plain YAML scalar.
 */
export function withFrontmatterKey(source: string, key: string, value: string): string {
  const bom = source.startsWith("﻿") ? "﻿" : "";
  const text = source.slice(bom.length);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const entry = `${key}: ${value}`;
  // Each line with its own ending, so joining them gives back the text byte for byte.
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (content(lines[0]) !== FENCE) {
    return `${bom}${FENCE}${eol}${entry}${eol}${FENCE}${eol}${text === "" ? "" : eol}${text}`;
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
  if (at < 0) {
    return `${bom}${[...lines.slice(0, close), `${entry}${eol}`, ...lines.slice(close)].join("")}`;
  }
  let end = at + 1;
  while (end < close && /^[ \t]+\S/.test(lines[end] ?? "")) {
    end += 1;
  }
  const ending = lines[at]?.endsWith("\r\n") ? "\r\n" : "\n";
  return `${bom}${[...lines.slice(0, at), `${entry}${ending}`, ...lines.slice(end)].join("")}`;
}

/** A line without its ending or the spaces around it. */
function content(line: string | undefined): string | undefined {
  return line?.trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
