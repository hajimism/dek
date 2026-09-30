// How each command's result reads as text; commands.ts says which command prints which.
// The pieces the dev server's log shares, such as diagnostics and tables, are in format.ts.
import type { Diagnostic, SkippedCheck } from "../core/diagnostic.ts";
import { formatClock } from "../core/timing.ts";
import type { BuildCliResult } from "./build.ts";
import type { CheckCliResult } from "./check.ts";
import type { CuesResult } from "./cues.ts";
import { formatDiagnostics, formatTable } from "./format.ts";
import type { NavResult } from "./goto.ts";
import type { InitResult } from "./init.ts";
import type { LsDeckResult, LsListResult } from "./ls.ts";
import type { MarksCliResult } from "./marks.ts";
import type { MvResult } from "./mv.ts";
import type { NewResult } from "./new.ts";
import type { PdfCliResult } from "./pdf.ts";
import type { RefCliResult } from "./ref.ts";
import type { ShotCliResult } from "./shot.ts";
import type { ShowResult } from "./show.ts";
import type { ThemeResult } from "./theme.ts";
import { ansi, padEndWidth } from "./tty.ts";
import type { VideoCliResult } from "./video.ts";
import type { VoiceCliResult } from "./voice.ts";

/** "2 errors and 1 warning"; empty when there are none. */
export function countSummary(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diagnostics.length - errors;
  const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? "" : "s"}`;
  return [
    ...(errors > 0 ? [count(errors, "error")] : []),
    ...(warnings > 0 ? [count(warnings, "warning")] : []),
  ].join(" and ");
}

/** One `<check>: skipped (<reason>)` line per skipped check, each followed by its hint. */
export function formatSkipped(skipped: SkippedCheck[] | undefined, color = false): string {
  const c = ansi(color);
  return (skipped ?? [])
    .flatMap((entry) => [
      `${entry.check}: skipped (${entry.reason})`,
      ...(entry.hint ? [`  ${c.yellow("help:")} ${entry.hint}`] : []),
    ])
    .join("\n");
}

/**
 * The slides sync kept though their section is gone, for stderr: sync removes only what it wrote,
 * so saying nothing would read as a deck with nothing left over.
 */
export function formatKept(kept: string[], color = false): string {
  const c = ansi(color);
  return kept
    .flatMap((path) => [
      `kept ${path}: its section is gone from script.md, and the file is yours`,
      `  ${c.yellow("help:")} ${ORPHAN_HINT}`,
    ])
    .join("\n");
}

/**
 * A theme.css init kept that is no dek theme, for stderr: every deck copies it, so each would fail
 * lint on its first run with a DEK015 per token.
 */
export function formatKeptTheme(data: InitResult, color = false): string {
  const missing = data.missingTokens ?? [];
  if (missing.length === 0) {
    return "";
  }
  const c = ansi(color);
  const theme = data.kept.find((path) => path.endsWith("theme.css")) ?? "theme.css";
  const named = missing.length > 3 ? [...missing.slice(0, 3), "…"] : missing;
  return [
    `${theme} was kept and lacks ${missing.length} ${missing.length === 1 ? "token" : "tokens"} every deck needs (${named.join(", ")})`,
    `  ${c.yellow("help:")} add them to its .slide rule, or move it aside and run \`dek init\` again for dek's own theme`,
  ].join("\n");
}

// Lint alone weighs the sections a kept slide could be renamed to (DEK002), so sync defers to it
// rather than suggest the section or the deletion a rename would make wrong.
const ORPHAN_HINT =
  "run `dek lint`, which names the `dek mv` if its section was renamed, or what else to do with it";

function withNext(done: string, next: string[]): string {
  return next.length === 0
    ? done
    : `${done}\n\nnext:\n${next.map((step) => `  ${step}`).join("\n")}`;
}

/**
 * What init wrote, then each file it found already there and left as it was, the commands to
 * run next, and the Playwright install when the project lacks it.
 */
export function formatInit(data: InitResult): string {
  const header =
    data.created.length > 0
      ? `created project at ${data.root}`
      : `project at ${data.root} is already set up`;
  const lines = [
    ...data.created,
    ...data.updated.map((path) => `${path} (updated)`),
    ...data.kept.map((path) => `${path} (kept)`),
  ];
  const done = withNext([header, ...lines.map((line) => `  ${line}`)].join("\n"), data.next);
  return data.playwright
    ? `${done}\n\nfor dek shot, dek pdf, and --visual:\n  ${data.playwright}`
    : done;
}

/** The deck, and any of dek's own files it brought up to date: the rest is the deck's, and new. */
export function formatNew(data: NewResult): string {
  const updated = data.updated.map((path) => `  ${path} (updated)`);
  return withNext([`created deck ${data.name}`, ...updated].join("\n"), data.next);
}

export function formatMv(data: MvResult): string {
  if (data.to) {
    return `renamed ${data.from} -> ${data.to}`;
  }
  if (data.before) {
    return `moved ${data.from} before ${data.before}`;
  }
  if (data.after) {
    return `moved ${data.from} after ${data.after}`;
  }
  return `moved ${data.from}`;
}

export function formatNav(data: NavResult): string {
  return data.beatIndex > 0 ? `${data.slug} ${data.beatIndex}` : data.slug;
}

/**
 * Each mark at its line in script.md, the way an editor jumps to it, and the first line of what
 * the beat says now; a beat gone since it was marked shows what it said.
 */
export function formatMarks(data: MarksCliResult): string {
  if (data.action === "clear") {
    return data.cleared === 1 ? "cleared 1 mark" : `cleared ${data.cleared} marks`;
  }
  if (data.marks.length === 0) {
    return "no marks: press m in the presenter view to mark a beat";
  }
  return data.marks
    .flatMap((mark) => {
      const where = mark.line === null ? mark.path : `${mark.path}:${mark.line}`;
      const beat = mark.beat === null ? mark.slug : `${mark.slug} › ${mark.beat}`;
      const status = mark.status === "open" ? "" : ` (${mark.status})`;
      const words = (mark.text ?? mark.was).split("\n").find((line) => line.trim() !== "");
      return [`${where}  ${beat}${status}`, ...(words ? [`  ${words.trim()}`] : [])];
    })
    .join("\n");
}

/** The contact sheets when there are any, else each screenshot. */
export function formatShot(data: ShotCliResult): string {
  return (data.sheets ?? data.shots.map((shot) => shot.path)).join("\n");
}

/** What the build wrote and what lint found; why an image is missing goes to stderr. */
export function formatBuild(data: BuildCliResult): string {
  const summary = lintSummary(data.diagnostics);
  const wrote = [...data.outs, ...data.images].map((path) => `wrote ${path}`);
  return [...wrote, ...(summary ? [summary] : [])].join("\n");
}

export function formatVideo(data: VideoCliResult): string {
  return [`wrote ${data.out}`, data.vtt, data.chapters, data.credits].filter(Boolean).join("\n");
}

export function formatPdf(data: PdfCliResult): string {
  return data.outs.map((path) => `wrote ${path}`).join("\n");
}

export function formatLs(data: LsListResult | LsDeckResult): string {
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
      const project = data.diagnostics.length;
      return [
        table,
        ...(data.failed.length > 0
          ? [`failed  ${data.failed.map((entry) => entry.name).join(", ")}`]
          : []),
        ...(project > 0 ? [`project  ${diagnosticCount(project)}`] : []),
      ].join("\n");
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
      const countLabel = formatSkipped(data.skipped) || diagnosticCount(data.diagnostics.length);
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

function diagnosticCount(count: number): string {
  return count === 1 ? "1 diagnostic" : `${count} diagnostics`;
}

/**
 * "lint: 1 error from dek's rules; run `dek lint` to see it", or nothing when clean. A build
 * runs dek's rules only; `dek lint` adds rumdl, so the count names what it covers.
 */
function lintSummary(diagnostics: Diagnostic[]): string | undefined {
  if (diagnostics.length === 0) {
    return undefined;
  }
  const them = diagnostics.length === 1 ? "it" : "them";
  return `lint: ${countSummary(diagnostics)} ${DEK_RULES}; run \`dek lint\` to see ${them}`;
}

/** What build and ls count: dek's own rules, without the rumdl pass `dek lint` adds. */
const DEK_RULES = "from dek's rules";

export function formatTheme(data: ThemeResult): string {
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

export function formatCues(data: CuesResult, color = false): string {
  const body =
    data.cues.length === 0
      ? `${data.name}  0 cues`
      : data.cues
          .map((cue) => {
            const header =
              cue.position.beatIndex > 0 ? `${cue.slug} #${cue.position.beatIndex}` : cue.slug;
            if (cue.paragraphs.length === 0) {
              return header;
            }
            return `${header}\n${cue.paragraphs.map((paragraph) => `  ${paragraph}`).join("\n")}`;
          })
          .join("\n\n");
  if (data.diagnostics.length === 0) {
    return body;
  }
  return `${body}\n\n${formatDiagnostics(data.diagnostics, { color })}`;
}

export function formatVoice(data: VoiceCliResult): string {
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

/** One labeled part per file, so a reader never confuses where a line came from. */
export function formatShow(data: ShowResult): string {
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

export function formatRef(data: RefCliResult): string {
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

/** A check's diagnostics, its screenshot, and each beat's reading; what it skipped goes to stderr. */
export function formatCheck(data: CheckCliResult, color = false): string {
  const lines = [formatDiagnostics(data.diagnostics, { color })];
  if (data.shot) {
    lines.push(data.shot);
  }
  if (data.fill) {
    lines.push(...formatFill(data.fill));
  }
  if (data.voice) {
    for (const beat of data.voice.beats) {
      const kana = beat.sentences.map((sentence) => sentence.kana).join(" ");
      const note = beat.empty ? " (empty beat)" : "";
      lines.push(`#${beat.beatIndex}  ${(beat.durationMs / 1000).toFixed(1)}s  ${kana}${note}`);
    }
  }
  return lines.join("\n");
}

/** A fill as whole percentages: the share of the frame, the box it lies in, then its bands. */
function formatFill({
  coverage,
  box,
  rows,
  columns,
}: NonNullable<CheckCliResult["fill"]>): string[] {
  if (!box) {
    return ["fill: nothing to read or look at on the slide"];
  }
  const percent = (share: number): string => String(Math.round(share * 100));
  const within = (["left", "top", "right", "bottom"] as const)
    .map((side) => `${side} ${percent(box[side])}%`)
    .join(" ");
  return [
    `fill: ${percent(coverage)}% of the frame, within ${within}`,
    `  rows, top to bottom:    ${rows.map(percent).join(" ")}`,
    `  columns, left to right: ${columns.map(percent).join(" ")}`,
  ];
}

/** Each diagnostic with its path as `display` shows it. */
export function displayDiagnostics(
  diagnostics: Diagnostic[],
  display: (path: string) => string,
): Diagnostic[] {
  return diagnostics.map((diagnostic) =>
    diagnostic.path === undefined ? diagnostic : { ...diagnostic, path: display(diagnostic.path) },
  );
}
