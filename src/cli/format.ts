import { isAbsolute, relative } from "node:path";
import { type Diagnostic, severityOf } from "../core/diagnostic.ts";
import { DekError } from "../core/error.ts";
import type { DevEvent } from "../server/dev.ts";
import { ansi, displayWidth, padEndWidth, padStartWidth } from "./tty.ts";

export function helpText(): string {
  return `dek — talk-script-first HTML slides

Dev
  dek [deck] [--visual] [--port N]
                      start the dev server; --visual lints overflow/contrast on save
  dek --remote        share on LAN; presenter notes are password-protected
  dek rehearse [slug] auto-advance from a Timeline (no video)

Project
  dek init [dir]      create a project
  dek new <name>      add a deck
  dek ls [deck]       list decks or show one

Slide
  dek show <slug>     print a section's script and HTML
  dek theme [layout]  list the deck theme's layouts, classes, and tokens; print a layout's markup
  dek check <slug>    lint one slide; --shot adds a screenshot; --voice adds readings
  dek shot [slug]     write screenshots; --step <id|n> picks a beat
  dek shot <a> --to <b> [--at 0.5]
                      freeze the transition from a into b (morph check)
  dek mv <old> <new>  rename a section id and its HTML
  dek mv <slug> --before|--after <slug>
                      reorder a section
  dek goto <slug>     jump the open browser
  dek current         print the slide on screen
  dek sync            create missing skeleton slides

CI
  dek lint            check script.md against slides
  dek lint --visual   add overflow and contrast rules
  dek cues            print spoken paragraphs as Cue[]
  dek voice           synthesize changed sentences
  dek voice speakers  list engine speakers
  dek voice say TEXT  speak one sentence
  dek voice dict add  add a reading
  dek voice pin       pin TTS master.wav + timeline.json
  dek build [--root-dist]
                      write a single HTML file
  dek video [slug] [--root-dist]
                      bake dist/<deck>.mp4 (or one slide under .cache/video/)
  dek pdf [--root-dist]
                      write a PDF
  dek help            show this help

Commands that print a result accept --json. dek and dek rehearse stay running.
Pass a deck name or --deck <name> to target a deck from the project root.
dek help --agent      compact command reference for agents
`;
}

export function agentHelpText(): string {
  return `dek — agent interface
Result commands accept --json. dek / rehearse do not (long-running). Diagnostics: dek lint --format sarif.
Each diagnostic has severity (error | warning) and data; only errors exit 1.
Scope: project root = all decks; deck dir = that deck; NAME or --deck NAME.

dek [deck] [--visual] [--port N]
dek --remote [--password PWD]
dek rehearse [slug]
dek init [dir] [--deck NAME]
dek new <name> [--theme-from DECK]
dek ls [deck]
dek show <slug>
dek theme [layout]  deck theme: layouts, classes, tokens; with a layout, its example markup
dek mv <old> <new> | dek mv <slug> --before|--after <slug>
dek sync            create missing skeleton slides; never overwrites
dek lint [--fix] [--visual] [--format sarif]
dek cues
dek voice [speakers | say TEXT | dict add WORD KANA | pin]
dek check <slug> [--shot] [--voice]
dek shot [slug] [--step <id|n>]
dek shot <a> --to <b> [--at 0..1]   frame of the a→b transition, default 0.5
dek goto <slug>     requires running dek
dek current         requires running dek
dek build [--root-dist]
dek video [slug] [--fps N] [--root-dist]
dek pdf [--root-dist]
dek help --agent

Errors include hint with the next command to run.
`;
}

export function formatLocation(location: { path?: string; line?: number }): string {
  if (location.path !== undefined && location.line !== undefined) {
    return `${location.path}:${location.line}`;
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
    const label = severityOf(diagnostic) === "warning" ? ` ${c.yellow("warning:")}` : "";
    const line = `${prefix}${c.yellow(diagnostic.id)}${label} ${diagnostic.message}`;
    return diagnostic.hint ? [line, `  ${c.yellow("help:")} ${diagnostic.hint}`] : [line];
  });
  return lines.join("\n");
}

export type FormattedError = {
  message: string;
  path?: string;
  line?: number;
  hint?: string;
};

/** A path as the reader should type it: relative to `cwd` when one is given. */
export function displayPath(path: string, cwd?: string): string {
  if (cwd === undefined || !isAbsolute(path)) {
    return path;
  }
  return relative(cwd, path) || ".";
}

export function formatError(error: unknown, opts?: { cwd?: string }): FormattedError {
  if (error instanceof DekError) {
    return {
      message: error.message,
      ...(error.path !== undefined ? { path: displayPath(error.path, opts?.cwd) } : {}),
      ...(error.line !== undefined ? { line: error.line } : {}),
      ...(error.hint !== undefined ? { hint: error.hint } : {}),
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
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

export function formatCreated(created: string[]): string {
  const noun = created.length === 1 ? "file" : "files";
  const header = `synced ${created.length} ${noun}`;
  if (created.length === 0) {
    return header;
  }
  return `${header}\n${created.map((path) => `  ${path}`).join("\n")}`;
}

export function formatDevEvent(event: DevEvent, opts?: { cwd?: string }): string | null {
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
      return formatCreated(event.created);
    case "diagnostics":
      return event.diagnostics.length === 0
        ? null
        : formatDiagnostics(event.diagnostics, { cwd: opts?.cwd });
    case "timeline":
      return "timeline";
  }
}

export function writeDevEvent(
  event: DevEvent,
  stream: { write(chunk: string): unknown },
  opts?: { cwd?: string },
): void {
  const text = formatDevEvent(event, opts);
  if (text) {
    stream.write(`${text}\n`);
  }
}
