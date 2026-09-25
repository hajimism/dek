import { type Diagnostic, hasErrors, type SkippedCheck } from "../core/diagnostic.ts";
import { mergeSarif, toSarif } from "../core/sarif.ts";
import { formatClock } from "../core/timing.ts";
import type { BuildCliResult } from "./build.ts";
import type { CheckCliResult } from "./check.ts";
import type { CuesResult } from "./cues.ts";
import {
  displayPath,
  type FormattedError,
  formatCreated,
  formatDiagnostics,
  formatInit,
  formatTable,
} from "./format.ts";
import type { NavResult } from "./goto.ts";
import type { InitResult } from "./init.ts";
import type { LintCliResult } from "./lint.ts";
import type { LsDeckResult, LsListResult } from "./ls.ts";
import type { MvResult } from "./mv.ts";
import type { NewResult } from "./new.ts";
import type { PdfCliResult } from "./pdf.ts";
import type { RefCliResult } from "./ref.ts";
import type { ShotCliResult } from "./shot.ts";
import type { ShowResult } from "./show.ts";
import type { SyncCliResult } from "./sync.ts";
import type { ThemeResult } from "./theme.ts";
import { ansi, padEndWidth, shouldColor, terminalSafe } from "./tty.ts";
import type { VideoCliResult } from "./video.ts";
import type { VoiceCliResult } from "./voice.ts";

export type CliResult =
  | { command: "init"; data: InitResult }
  | { command: "new"; data: NewResult }
  | { command: "ls"; data: LsListResult | LsDeckResult }
  | { command: "show"; data: ShowResult }
  | { command: "ref"; data: RefCliResult }
  | { command: "sync"; data: SyncCliResult }
  | { command: "theme"; data: ThemeResult }
  | { command: "lint"; data: LintCliResult }
  | { command: "mv"; data: MvResult }
  | { command: "build"; data: BuildCliResult }
  | { command: "pdf"; data: PdfCliResult }
  | { command: "shot"; data: ShotCliResult }
  | { command: "check"; data: CheckCliResult }
  | { command: "goto"; data: NavResult }
  | { command: "current"; data: NavResult }
  | { command: "cues"; data: CuesResult }
  | { command: "voice"; data: VoiceCliResult }
  | { command: "video"; data: VideoCliResult };

export type { SkippedCheck };

/** `{ skipped }` when any check was skipped, nothing otherwise: the field is present only when it matters. */
export function skippedChecks(skipped: SkippedCheck[]): { skipped?: SkippedCheck[] } {
  return skipped.length > 0 ? { skipped } : {};
}

export type WriteSuccessOptions = {
  json: boolean;
  format?: string;
  /** Print diagnostic paths relative to this directory. SARIF keeps absolute URIs. */
  cwd?: string;
};

export function writeSuccess(original: CliResult, options: WriteSuccessOptions): void {
  const result = options.cwd === undefined ? original : displayPaths(original, options.cwd);
  const failure = failureOf(result);
  if (original.command === "lint" && options.format === "sarif") {
    const dek = original.data.diagnostics.filter((diagnostic) => diagnostic.id.startsWith("DEK"));
    const sarif = toSarif(dek, { skipped: original.data.skipped ?? [] });
    process.stdout.write(`${JSON.stringify(mergeSarif(sarif, original.data.rumdlSarif))}\n`);
  } else if (options.json) {
    const envelope = failure ? { ok: false, error: failure } : { ok: true };
    process.stdout.write(`${JSON.stringify({ ...envelope, ...jsonData(result) })}\n`);
  } else if (result.command === "lint") {
    const color = shouldColor(process.stdout);
    process.stdout.write(
      `${terminalSafe(formatDiagnostics(result.data.diagnostics, { color }))}\n`,
    );
    const skipped = formatSkipped(result.data.skipped, shouldColor(process.stderr));
    if (skipped) {
      process.stderr.write(`${terminalSafe(skipped)}\n`);
    }
  } else {
    process.stdout.write(`${terminalSafe(formatText(result))}\n`);
  }

  if (failure) {
    // Not process.exit: a pipe still holds the output, and exit would cut it at 64 KB.
    process.exitCode = 1;
  }
}

/**
 * The `error` of a failed run. Only lint and check fail on an error diagnostic;
 * a build or a listing reports what lint would say but still did its job: at
 * the venue, a deck that shows is better than none. The error has the shape a
 * thrown one has, so `--json` readers branch on `ok` and read `error` alike.
 */
function failureOf(result: CliResult): FormattedError | undefined {
  if (result.command !== "lint" && result.command !== "check") {
    return undefined;
  }
  const { diagnostics } = result.data;
  if (!hasErrors(diagnostics)) {
    return undefined;
  }
  const rerun = result.command === "lint" ? "dek lint" : `dek check ${result.data.slug}`;
  return {
    message: `${result.command} found ${countSummary(diagnostics)}`,
    hint: `fix each error in diagnostics, then run \`${rerun}\` again`,
  };
}

/** "2 errors and 1 warning"; empty when there are none. */
function countSummary(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.length - errors;
  const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
  return [
    ...(errors > 0 ? [count(errors, "error")] : []),
    ...(warnings > 0 ? [count(warnings, "warning")] : []),
  ].join(" and ");
}

/** One `<check>: skipped (<reason>)` line per skipped check, each followed by its hint. */
function formatSkipped(skipped: SkippedCheck[] | undefined, color = false): string {
  const c = ansi(color);
  return (skipped ?? [])
    .flatMap((entry) => [
      `${entry.check}: skipped (${entry.reason})`,
      ...(entry.hint ? [`  ${c.yellow("help:")} ${entry.hint}`] : []),
    ])
    .join("\n");
}

/**
 * Paths into the source tree (diagnostics, files dek created) relative to
 * `cwd`, so an agent reads `slides/intro.html` instead of the same long
 * absolute prefix on every line. Artifacts dek writes, such as `shot` or a
 * build, stay absolute: they are meant to be opened as-is.
 */
export function displayPaths(result: CliResult, cwd: string): CliResult {
  const files = (paths: string[]): string[] => paths.map((path) => displayPath(path, cwd));
  switch (result.command) {
    case "init":
      return {
        ...result,
        data: {
          ...result.data,
          created: files(result.data.created),
          kept: files(result.data.kept),
        },
      };
    case "new":
      return { ...result, data: { ...result.data, created: files(result.data.created) } };
    case "sync":
      return {
        ...result,
        data: {
          created: files(result.data.created),
          updated: files(result.data.updated),
          removed: files(result.data.removed),
        },
      };
    case "theme":
      return { ...result, data: { ...result.data, path: displayPath(result.data.path, cwd) } };
    default:
      return mapDiagnostics(result, (diagnostics) =>
        diagnostics.map((diagnostic) =>
          diagnostic.path === undefined
            ? diagnostic
            : { ...diagnostic, path: displayPath(diagnostic.path, cwd) },
        ),
      );
  }
}

/** Applies `fn` to every diagnostic list a result carries. */
function mapDiagnostics(
  result: CliResult,
  fn: (diagnostics: Diagnostic[]) => Diagnostic[],
): CliResult {
  switch (result.command) {
    case "lint":
      return { ...result, data: { ...result.data, diagnostics: fn(result.data.diagnostics) } };
    case "check":
      return { ...result, data: { ...result.data, diagnostics: fn(result.data.diagnostics) } };
    case "cues":
      return { ...result, data: { ...result.data, diagnostics: fn(result.data.diagnostics) } };
    case "build":
      return { ...result, data: { ...result.data, diagnostics: fn(result.data.diagnostics) } };
    case "ls":
      if (result.data.kind === "deck") {
        return { ...result, data: { ...result.data, diagnostics: fn(result.data.diagnostics) } };
      }
      return {
        ...result,
        data: {
          ...result.data,
          decks: result.data.decks.map((deck) => ({ ...deck, diagnostics: fn(deck.diagnostics) })),
        },
      };
    default:
      return result;
  }
}

function withNext(done: string, next: string[]): string {
  return next.length === 0
    ? done
    : `${done}\n\nnext:\n${next.map((step) => `  ${step}`).join("\n")}`;
}

export function formatText(result: CliResult): string {
  switch (result.command) {
    case "init":
      return withNext(formatInit(result.data), result.data.next);
    case "new":
      return withNext(`created deck ${result.data.name}`, result.data.next);
    case "ls":
      return formatLs(result.data);
    case "show":
      return formatShow(result.data);
    case "ref":
      return formatRef(result.data);
    case "sync":
      return formatCreated(result.data.created, result.data.updated, result.data.removed);
    case "theme":
      return formatTheme(result.data);
    case "lint":
      return formatDiagnostics(result.data.diagnostics);
    case "mv":
      if (result.data.to) {
        return `renamed ${result.data.from} -> ${result.data.to}`;
      }
      if (result.data.before) {
        return `moved ${result.data.from} before ${result.data.before}`;
      }
      if (result.data.after) {
        return `moved ${result.data.from} after ${result.data.after}`;
      }
      return `moved ${result.data.from}`;
    case "build": {
      const summary = lintSummary(result.data.diagnostics);
      const wrote = [...result.data.outs, ...result.data.images].map((path) => `wrote ${path}`);
      return [...wrote, ...result.data.notes, ...(summary ? [summary] : [])].join("\n");
    }
    case "pdf":
      return result.data.outs.map((path) => `wrote ${path}`).join("\n");
    case "shot":
      return result.data.shots.map((shot) => shot.path).join("\n");
    case "check": {
      const color = shouldColor(process.stdout);
      const lines = [formatDiagnostics(result.data.diagnostics, { color })];
      const skipped = formatSkipped(result.data.skipped, color);
      if (skipped) {
        lines.push(skipped);
      }
      if (result.data.shot) {
        lines.push(result.data.shot);
      }
      if (result.data.voice) {
        for (const beat of result.data.voice.beats) {
          const kana = beat.sentences.map((sentence) => sentence.kana).join(" ");
          const note = beat.empty ? " (empty beat)" : "";
          lines.push(
            `#${beat.beatIndex + 1}  ${(beat.durationMs / 1000).toFixed(1)}s  ${kana}${note}`,
          );
        }
      }
      return lines.join("\n");
    }
    case "goto":
    case "current":
      return result.data.beatIndex > 0
        ? `${result.data.slug} ${result.data.beatIndex + 1}`
        : result.data.slug;
    case "cues":
      return formatCues(result.data);
    case "voice":
      return formatVoice(result.data);
    case "video":
      return [
        `wrote ${result.data.out}`,
        result.data.vtt,
        result.data.chapters,
        result.data.credits,
      ]
        .filter(Boolean)
        .join("\n");
  }
}

function formatLs(data: LsListResult | LsDeckResult): string {
  switch (data.kind) {
    case "list": {
      const table = formatTable(
        ["NAME", "TITLE", "SECTIONS", "SLIDES", "DIAGNOSTICS"],
        data.decks.map((deck) => [
          deck.name,
          deck.title,
          String(deck.sections),
          String(deck.slides),
          String(deck.diagnostics.length),
        ]),
        ["left", "left", "right", "right", "right"],
      );
      if (data.failed.length === 0) {
        return table;
      }
      const failed = data.failed.map((entry) => entry.name).join(", ");
      return `${table}\nfailed  ${failed}`;
    }
    case "deck": {
      const meta: Array<[string, string]> = [];
      if (data.ref) {
        meta.push(["rev", data.ref.rev.slice(0, 7)]);
      }
      if (data.event) {
        meta.push(["event", data.event]);
      }
      if (data.date) {
        meta.push(["date", data.date]);
      }
      if (data.duration) {
        meta.push(["duration", data.duration]);
      }
      meta.push(["estimate", formatClock(data.estimateSeconds)]);
      if (data.videoSeconds !== undefined) {
        meta.push(["video", formatClock(data.videoSeconds)]);
      }
      const keyWidth = Math.max(...meta.map(([key]) => key.length));
      const hasBudget = data.sections.some((section) => section.budgetSeconds !== undefined);
      const hasVideo = data.sections.some((section) => section.videoSeconds !== undefined);
      const headers = ["SLUG", "TITLE", "ESTIMATE"];
      if (hasVideo) {
        headers.push("VIDEO");
      }
      if (hasBudget) {
        headers.push("BUDGET");
      }
      const rows = data.sections.map((section) => {
        const row = [section.slug, section.title, formatClock(section.estimateSeconds)];
        if (hasVideo) {
          row.push(section.videoSeconds !== undefined ? formatClock(section.videoSeconds) : "");
        }
        if (hasBudget) {
          row.push(section.budgetSeconds !== undefined ? formatClock(section.budgetSeconds) : "");
        }
        return row;
      });
      const align: Array<"left" | "right"> = [
        "left",
        "left",
        "right",
        ...(hasVideo ? (["right"] as const) : []),
        ...(hasBudget ? (["right"] as const) : []),
      ];
      const count = data.diagnostics.length;
      const countLabel =
        formatSkipped(data.skipped) || (count === 1 ? "1 diagnostic" : `${count} diagnostics`);
      return [
        `${data.ref?.name ?? data.name}  ${data.title}`,
        ...meta.map(([key, value]) => `${padEndWidth(key, keyWidth)}  ${value}`),
        "",
        formatTable(headers, rows, [...align]),
        "",
        countLabel,
      ].join("\n");
    }
  }
}

/** "lint: 1 error and 2 warnings; run `dek lint` to see them", or nothing when clean. */
function lintSummary(diagnostics: Diagnostic[]): string | undefined {
  if (diagnostics.length === 0) {
    return undefined;
  }
  const them = diagnostics.length === 1 ? "it" : "them";
  return `lint: ${countSummary(diagnostics)}; run \`dek lint\` to see ${them}`;
}

function formatTheme(data: ThemeResult): string {
  if (data.layout) {
    return data.layout.example;
  }
  const width = Math.max(0, ...data.tokens.map((token) => token.name.length));
  return [
    data.path,
    "",
    "LAYOUTS",
    ...data.layouts.map(
      (layout) => `  ${layout.name}${layout.example === undefined ? "  (no example)" : ""}`,
    ),
    "",
    "CLASSES",
    `  ${data.classes.join(" ")}`,
    "",
    "TOKENS",
    ...data.tokens.map((token) => `  ${token.name.padEnd(width)}  ${token.value}`),
    "",
    "Markup for a layout: dek theme <layout>",
  ].join("\n");
}

function formatCues(data: CuesResult): string {
  const body =
    data.cues.length === 0
      ? `${data.name}  0 cues`
      : data.cues
          .map((cue) => {
            const header = `${cue.slug} #${cue.position.beatIndex + 1}`;
            if (cue.paragraphs.length === 0) {
              return header;
            }
            return `${header}\n${cue.paragraphs.map((paragraph) => `  ${paragraph}`).join("\n")}`;
          })
          .join("\n\n");
  if (data.diagnostics.length === 0) {
    return body;
  }
  return `${body}\n\n${formatDiagnostics(data.diagnostics, { color: shouldColor(process.stdout) })}`;
}

function formatVoice(data: VoiceCliResult): string {
  switch (data.action) {
    case "synth":
      return `synthesized ${data.synthesized}, cached ${data.cached}\n${data.timelinePath}`;
    case "speakers":
      return data.speakers
        .map((speaker) => `${speaker.name}: ${speaker.styles.join(", ")}`)
        .join("\n");
    case "say":
      return data.path;
    case "dict":
      return `added ${data.key} -> ${data.kana}`;
    case "pin":
      return `pinned ${data.audioPath}`;
  }
}

function jsonData(result: CliResult): object {
  if (result.command === "ls") {
    const { kind: _kind, ...data } = result.data;
    return data;
  }
  if (result.command === "lint") {
    const { rumdlSarif: _rumdlSarif, ...data } = result.data;
    return data;
  }
  return result.data;
}

/** One labeled part per file, so a reader never confuses where a line came from. */
function formatShow(data: ShowResult): string {
  const parts: Array<[string, string | null]> = [
    ["script.md", data.script],
    [`slides/${data.slug}.html`, data.html],
    [`slides/${data.slug}.css`, data.css],
    [`slides/${data.slug}.ts`, data.ts],
    ["theme.css (the rules this slide uses)", data.theme || null],
    ["assets", data.assets.length > 0 ? data.assets.join("\n") : null],
  ];
  return parts
    .flatMap(([label, body]) => (body === null ? [] : [`--- ${label}\n${body.replace(/\n$/, "")}`]))
    .join("\n\n");
}

function formatRef(data: RefCliResult): string {
  const short = (rev: string) => rev.slice(0, 7);
  switch (data.action) {
    case "add": {
      const head = !data.changed
        ? `${data.name} is already at ${short(data.rev)}`
        : data.from
          ? `pinned ${data.name} at ${short(data.rev)} (was ${short(data.from)})`
          : `pinned ${data.name} at ${short(data.rev)}`;
      return [
        head,
        ...data.warnings.map((warning) => `warning: ${warning}`),
        `read it with \`dek ls ${data.name}\` and \`dek show ${data.name} <slug>\``,
      ].join("\n");
    }
    case "list":
      if (data.refs.length === 0) {
        return "no refs; add one with `dek ref owner/repo/deck`";
      }
      return formatTable(
        ["NAME", "REV", "TITLE", "SLIDES"],
        data.refs.map((ref) => [
          ref.name,
          short(ref.rev),
          ref.fetched ? (ref.title ?? "") : "(not fetched; a read fetches it)",
          ref.slides === undefined ? "" : String(ref.slides),
        ]),
        ["left", "left", "left", "right"],
      );
    case "rm":
      return `removed ${data.name}`;
  }
}
