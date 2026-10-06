import { isAbsolute, relative } from "node:path";
import type { Diagnostic } from "../core/diagnostic.ts";
import { type ErrorFields, errorFields } from "../core/error.ts";
import type { LiveEvent } from "../core/live-protocol.ts";
import { ansi, displayWidth, padEndWidth, padStartWidth } from "./tty.ts";

function formatLocation(location: { path?: string; line?: number; column?: number }): string {
  if (location.path !== undefined && location.line !== undefined) {
    const column = location.column === undefined ? "" : `:${location.column}`;
    return `${location.path}:${location.line}${column}`;
  }
  if (location.path !== undefined) {
    return location.path;
  }
  if (location.line !== undefined) {
    return String(location.line);
  }
  return "";
}

export function formatDiagnostics(
  diagnostics: Diagnostic[],
  opts?: { color?: boolean; cwd?: string },
): string {
  if (diagnostics.length === 0) {
    return "no diagnostics";
  }
  const c = ansi(opts?.color === true);
  const lines = diagnostics.flatMap((diagnostic) => {
    const where = formatLocation({
      ...diagnostic,
      ...(diagnostic.path !== undefined ? { path: displayPath(diagnostic.path, opts?.cwd) } : {}),
    });
    const prefix = where ? `${c.cyan(where)}: ` : "";
    const label = diagnostic.severity === "warning" ? ` ${c.yellow("warning:")}` : "";
    const line = `${prefix}${c.yellow(diagnostic.id)}${label} ${diagnostic.message}`;
    return diagnostic.hint ? [line, `  ${c.yellow("help:")} ${diagnostic.hint}`] : [line];
  });
  return lines.join("\n");
}

export type FormattedError = ErrorFields;

/** A path as the reader should type it: relative to `cwd` when one is given. */
export function displayPath(path: string, cwd?: string): string {
  if (cwd === undefined || !isAbsolute(path)) {
    return path;
  }
  return relative(cwd, path) || ".";
}

export function formatError(error: unknown, opts?: { cwd?: string }): FormattedError {
  const fields = errorFields(error);
  return fields.path === undefined
    ? fields
    : { ...fields, path: displayPath(fields.path, opts?.cwd) };
}

export function formatErrorText(error: unknown, opts?: { color?: boolean; cwd?: string }): string {
  const formatted = formatError(error, opts);
  const c = ansi(opts?.color === true);
  const parts = [`${c.bold(c.red("error:"))} ${formatted.message}`];
  if (formatted.path) {
    const loc =
      formatted.line !== undefined ? `${formatted.path}:${formatted.line}` : formatted.path;
    parts.push(` ${c.cyan("-->")} ${loc}`);
  }
  if (formatted.hint) {
    parts.push(`  ${c.yellow("help:")} ${formatted.hint}`);
  }
  return parts.join("\n");
}

export function formatTable(
  headers: string[],
  rows: string[][],
  align?: Array<"left" | "right">,
): string {
  const widths = headers.map((header, index) =>
    Math.max(displayWidth(header), ...rows.map((row) => displayWidth(row[index] ?? ""))),
  );
  const pad = (cell: string, index: number): string => {
    const width = widths[index] ?? 0;
    return (align?.[index] ?? "left") === "right"
      ? padStartWidth(cell, width)
      : padEndWidth(cell, width);
  };
  const line = (cells: string[]): string => cells.map((cell, index) => pad(cell, index)).join("  ");
  return [line(headers), ...rows.map((row) => line(row))].join("\n");
}

export function formatCreated(
  created: string[],
  updated: string[] = [],
  removed: string[] = [],
): string {
  const count = created.length + updated.length + removed.length;
  const header = `synced ${count} ${count === 1 ? "file" : "files"}`;
  const lines = [
    ...created,
    ...updated.map((path) => `${path} (updated)`),
    ...removed.map((path) => `${path} (removed)`),
  ];
  return [header, ...lines.map((line) => `  ${line}`)].join("\n");
}

/**
 * A dev server event as the terminal shows it. `deck` names the deck on each line that starts an
 * entry, for a server that serves several; lines that continue one stay indented under it.
 */
export function formatDevEvent(
  event: LiveEvent,
  opts?: { cwd?: string; deck?: string },
): string | null {
  const text = formatLiveEvent(event, opts?.cwd);
  const deck = opts?.deck;
  if (text === null || deck === undefined) {
    return text;
  }
  return text
    .split("\n")
    .map((line) => (/^\s/.test(line) ? line : `[${deck}] ${line}`))
    .join("\n");
}

function formatLiveEvent(event: LiveEvent, cwd: string | undefined): string | null {
  switch (event.type) {
    case "reload-slide":
      return `reload-slide ${event.slug}`;
    case "reload-theme":
      return "reload-theme";
    case "reload-script":
      return `reload-script ${event.slugs.join(", ")}`;
    case "sync":
      if ((event.removed?.length ?? 0) > 0 && event.created.length === 0) {
        const count = event.removed?.length ?? 0;
        return `removed ${count} ${count === 1 ? "file" : "files"}`;
      }
      return formatCreated(event.created, event.updated, event.removed);
    case "diagnostics":
      return event.diagnostics.length === 0 ? null : formatDiagnostics(event.diagnostics, { cwd });
    case "timeline":
      return "timeline";
    // The page that changed them already shows it; the terminal has nothing to add.
    case "annotations":
      return null;
  }
}

export function writeDevEvent(
  event: LiveEvent,
  stream: { write(chunk: string): unknown },
  opts?: { cwd?: string; deck?: string },
): void {
  const text = formatDevEvent(event, opts);
  if (text) {
    stream.write(`${text}\n`);
  }
}
