import type { Diagnostic } from "../core/diagnostic.ts";
import { mergeSarif, toSarif } from "../core/sarif.ts";
import { formatClock } from "../core/timing.ts";
import type { BuildCliResult } from "./build.ts";
import type { CheckCliResult } from "./check.ts";
import type { CuesResult } from "./cues.ts";
import { displayPath, formatCreated, formatDiagnostics, formatTable } from "./format.ts";
import type { NavResult } from "./goto.ts";
import type { InitResult } from "./init.ts";
import type { LintCliResult } from "./lint.ts";
import type { LsDeckResult, LsListResult } from "./ls.ts";
import type { MvResult } from "./mv.ts";
import type { NewResult } from "./new.ts";
import type { PdfCliResult } from "./pdf.ts";
import type { ShotCliResult } from "./shot.ts";
import type { ShowResult } from "./show.ts";
import type { SyncCliResult } from "./sync.ts";
import { ansi, padEndWidth, shouldColor } from "./tty.ts";
import type { VideoCliResult } from "./video.ts";
import type { VoiceCliResult } from "./voice.ts";

export type CliResult =
  | { command: "init"; data: InitResult }
  | { command: "new"; data: NewResult }
  | { command: "ls"; data: LsListResult | LsDeckResult }
  | { command: "show"; data: ShowResult }
  | { command: "sync"; data: SyncCliResult }
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

export type WriteSuccessOptions = {
  json: boolean;
  format?: string;
  /** Print diagnostic paths relative to this directory. SARIF keeps absolute URIs. */
  cwd?: string;
};

export function writeSuccess(original: CliResult, options: WriteSuccessOptions): void {
  const result = options.cwd === undefined ? original : displayPaths(original, options.cwd);
  if (original.command === "lint" && options.format === "sarif") {
    const dek = original.data.diagnostics.filter((diagnostic) => diagnostic.id.startsWith("DEK"));
    process.stdout.write(`${JSON.stringify(mergeSarif(toSarif(dek), original.data.rumdlSarif))}\n`);
  } else if (options.json) {
    const failed =
      (result.command === "lint" || result.command === "check") &&
      result.data.diagnostics.length > 0;
    process.stdout.write(`${JSON.stringify({ ok: !failed, ...jsonData(result) })}\n`);
  } else if (result.command === "lint") {
    process.stdout.write(
      `${formatDiagnostics(result.data.diagnostics, { color: shouldColor(process.stdout) })}\n`,
    );
    if (result.data.rumdl === "skipped") {
      process.stderr.write("rumdl: skipped\n");
    }
  } else {
    process.stdout.write(`${formatText(result)}\n`);
  }

  if (
    (result.command === "lint" || result.command === "check") &&
    result.data.diagnostics.length > 0
  ) {
    process.exit(1);
  }
}

/**
 * Paths into the source tree (diagnostics, files dek created) relative to
 * `cwd`, so an agent reads `slides/intro.html` instead of the same long
 * absolute prefix on every line. Artifacts dek writes, such as `shot` or a
 * build, stay absolute: they are meant to be opened as-is.
 */
export function displayPaths(result: CliResult, cwd: string): CliResult {
  const relative = (diagnostics: Diagnostic[]): Diagnostic[] =>
    diagnostics.map((diagnostic) =>
      diagnostic.path === undefined
        ? diagnostic
        : { ...diagnostic, path: displayPath(diagnostic.path, cwd) },
    );
  const files = (paths: string[]): string[] => paths.map((path) => displayPath(path, cwd));
  switch (result.command) {
    case "init":
      return { ...result, data: { ...result.data, created: files(result.data.created) } };
    case "new":
      return { ...result, data: { ...result.data, created: files(result.data.created) } };
    case "sync":
      return { ...result, data: { ...result.data, created: files(result.data.created) } };
    case "lint":
      return {
        ...result,
        data: { ...result.data, diagnostics: relative(result.data.diagnostics) },
      };
    case "check":
      return {
        ...result,
        data: { ...result.data, diagnostics: relative(result.data.diagnostics) },
      };
    case "cues":
      return {
        ...result,
        data: { ...result.data, diagnostics: relative(result.data.diagnostics) },
      };
    case "ls":
      if (result.data.kind === "deck") {
        return {
          ...result,
          data: { ...result.data, diagnostics: relative(result.data.diagnostics) },
        };
      }
      return {
        ...result,
        data: {
          ...result.data,
          decks: result.data.decks.map((deck) => ({
            ...deck,
            diagnostics: relative(deck.diagnostics),
          })),
        },
      };
    default:
      return result;
  }
}

export function formatText(result: CliResult): string {
  switch (result.command) {
    case "init":
      return `created project at ${result.data.root}`;
    case "new":
      return `created deck ${result.data.name}`;
    case "ls":
      return formatLs(result.data);
    case "show": {
      const html = result.data.html ? `\n\n${result.data.html}` : "";
      return `${result.data.script}${html}`;
    }
    case "sync":
      return formatCreated(result.data.created);
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
    case "build":
    case "pdf": {
      const paths = "outs" in result.data ? result.data.outs : [result.data.out];
      return paths.map((path) => `wrote ${path}`).join("\n");
    }
    case "shot":
      return result.data.shots.map((shot) => shot.path).join("\n");
    case "check": {
      const color = shouldColor(process.stdout);
      const lines = [formatDiagnostics(result.data.diagnostics, { color })];
      if (result.data.visual === "skipped") {
        lines.push("visual: skipped");
        if (result.data.hint) {
          lines.push(`  ${ansi(color).yellow("help:")} ${result.data.hint}`);
        }
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
      const countLabel = count === 1 ? "1 diagnostic" : `${count} diagnostics`;
      return [
        `${data.name}  ${data.title}`,
        ...meta.map(([key, value]) => `${padEndWidth(key, keyWidth)}  ${value}`),
        "",
        formatTable(headers, rows, [...align]),
        "",
        countLabel,
      ].join("\n");
    }
  }
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
