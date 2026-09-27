import type { SkippedCheck } from "../core/diagnostic.ts";
import { type CliResult, outputOf } from "./commands.ts";
import { displayPath, formatError, formatErrorText } from "./format.ts";
import { shouldColor, terminalSafe } from "./tty.ts";

export type { CliResult, SkippedCheck };

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

/**
 * Print a result: SARIF, the `--json` envelope, or text with what did not run on stderr.
 * Only lint and check fail on an error diagnostic; a build or a listing reports what lint
 * would say but still did its job: at the venue, a deck that shows is better than none. The
 * error has the shape a thrown one has, so `--json` readers branch on `ok` and read `error` alike.
 */
export function writeSuccess(original: CliResult, options: WriteSuccessOptions): void {
  const output = outputOf(original.command);
  const result = options.cwd === undefined ? original : displayPaths(original, options.cwd);
  const failure = output.failure?.(result.data);
  if (options.format === "sarif" && output.sarif) {
    process.stdout.write(`${JSON.stringify(output.sarif(original.data))}\n`);
  } else if (options.json) {
    const envelope = failure ? { ok: false, error: failure } : { ok: true };
    const data = output.json ? output.json(result.data) : (result.data as object);
    process.stdout.write(`${JSON.stringify({ ...envelope, ...data })}\n`);
  } else {
    const text = formatText(result, shouldColor(process.stdout));
    process.stdout.write(`${terminalSafe(text)}\n`);
    const notes = output.notes?.(result.data, shouldColor(process.stderr));
    if (notes) {
      process.stderr.write(`${terminalSafe(notes)}\n`);
    }
  }

  if (failure) {
    // Not process.exit: a pipe still holds the output, and exit would cut it at 64 KB.
    process.exitCode = 1;
  }
}

/**
 * Paths into the source tree (diagnostics, files dek created) relative to
 * `cwd`, so an agent reads `slides/intro.html` instead of the same long
 * absolute prefix on every line. Artifacts dek writes, such as `shot` or a
 * build, stay absolute: they are meant to be opened as-is.
 */
export function displayPaths(result: CliResult, cwd: string): CliResult {
  const paths = outputOf(result.command).paths;
  if (!paths) {
    return result;
  }
  return { ...result, data: paths(result.data, (path) => displayPath(path, cwd)) } as CliResult;
}

/** A result as text, without what did not run; see writeSuccess. */
export function formatText(result: CliResult, color = false): string {
  return outputOf(result.command).text(result.data, color);
}

/**
 * Print why a command line failed, in the shape a failed result has: `--json` readers get
 * `{ ok: false, error }` on stdout, everyone else the error and its hint on stderr.
 */
export function writeFailure(error: unknown, options: { json: boolean; cwd: string }): void {
  if (options.json) {
    const formatted = formatError(error, { cwd: options.cwd });
    process.stdout.write(`${JSON.stringify({ ok: false, error: formatted })}\n`);
  } else {
    const color = shouldColor(process.stderr);
    process.stderr.write(`${terminalSafe(formatErrorText(error, { color, cwd: options.cwd }))}\n`);
  }
  process.exitCode = 1;
}
