import { isAbsolute, relative } from "node:path";
import type { Diagnostic } from "../core/diagnostic.ts";
import { DekError } from "../core/error.ts";
import type { DevEvent } from "../server/dev.ts";
import type { InitResult } from "./init.ts";
import { ansi, displayWidth, padEndWidth, padStartWidth } from "./tty.ts";

export function helpText(): string {
  return `dek — a build system for talks

Dev
  dek [deck] [--visual] [--port N]
                      start the dev server; --visual lints overflow/contrast on save
  dek --remote        share on LAN; presenter notes are password-protected
  dek rehearse [slug] auto-advance from a Timeline (no video); --remote shares it

Project
  dek init [dir] [--deck NAME]
                      create a project, optionally with a first deck
  dek new <name> [--theme-from DECK]
                      add a deck
  dek ls [deck]       list decks or show one

Refs (other people's decks to read as models; read-only)
  dek ref owner/repo/deck[@rev]
                      pin and fetch one (a GitHub link works too); again moves the pin
  dek ref             list pinned refs
  dek ref rm <ref>    drop one
  dek ls|show|theme|shot <ref> ...
                      read a ref as you would a deck

Slide
  dek show <slug>     print a slide's script, HTML, CSS, TS, theme rules, assets
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
  dek sync            create missing skeletons; refresh or drop the ones nobody edited

CI
  dek lint [--fix]    check script.md against slides; --fix syncs first
  dek lint --visual   add overflow and contrast rules
  dek cues            print spoken paragraphs as Cue[]
  dek voice           synthesize changed sentences
  dek voice speakers  list engine speakers
  dek voice say TEXT  speak one sentence
  dek voice dict add  add a reading
  dek voice pin       pin TTS master.wav + timeline.json
  dek build [--root-dist]
                      write a single HTML file
  dek video [slug] [--fps N] [--root-dist]
                      bake dist/<deck>.mp4 (or one slide under .cache/video/)
  dek pdf [--root-dist]
                      write a PDF
  dek help [command]  show this help, or one command's usage and flags

Commands that print a result accept --json. dek and dek rehearse stay running.
Pass a deck name or --deck <name> to target a deck from the project root.
Flags are checked per command: an unknown flag is an error, not ignored.
dek <command> --help  one command's usage and flags; dek --version prints the version
dek help --agent      compact command reference for agents
`;
}

export function agentHelpText(): string {
  return `dek — agent interface
Result commands accept --json. dek / rehearse do not (long-running). Diagnostics: dek lint --format sarif.
Each diagnostic has severity (error | warning) and data; only errors exit 1.
Scope: project root = all decks; deck dir = that deck; NAME or --deck NAME.

dek [deck] [--visual] [--port N]
dek --remote
dek rehearse [slug] [--remote]
dek init [dir] [--deck NAME]
dek new <name> [--theme-from DECK]
dek ls [deck]
dek show <slug>     script, HTML, CSS, TS, the theme rules it uses, assets
dek ref [owner/repo/deck[@rev] | github-link]   pin + fetch; no args lists; dek ref rm REF
Refs are read-only decks to learn from: ls, show, theme, shot take owner/repo/deck as the deck.
dek theme [layout]  deck theme: layouts, classes, tokens; with a layout, its example markup
dek mv <old> <new> | dek mv <slug> --before|--after <slug>
dek sync            create missing skeletons; refresh or drop untouched ones; never edits your slides
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
dek help [command] | dek <command> --help | dek --version

Errors include hint with the next command to run.
`;
}

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

/** What init wrote, then each file it found already there and left as it was. */
export function formatInit(data: Pick<InitResult, "root" | "created" | "kept">): string {
  const header =
    data.created.length > 0
      ? `created project at ${data.root}`
      : `project at ${data.root} is already set up`;
  const lines = [...data.created, ...data.kept.map((path) => `${path} (kept)`)];
  return [header, ...lines.map((line) => `  ${line}`)].join("\n");
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
      return formatCreated(event.created, event.updated, event.removed);
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
