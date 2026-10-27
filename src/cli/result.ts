import type { Diagnostic, SkippedCheck } from "../core/diagnostic.ts";
import { DekError } from "../core/error.ts";
import { revealHidden } from "../core/foreign-text.ts";
import { PLAYWRIGHT_INSTALL, type PlaywrightRunner, playwrightReady } from "../core/playwright.ts";
import { addressHint, deckAround, type HintDeck } from "./address.ts";
import { type CliResult, outputOf } from "./commands.ts";
import type { FlagValues } from "./flags.ts";
import { displayPath, formatError, formatErrorText } from "./format.ts";
import { plainText, shouldColor, terminalSafe } from "./tty.ts";

export type { CliResult, SkippedCheck };

/** `{ skipped }` when any check was skipped, nothing otherwise: the field is present only when it matters. */
export function skippedChecks(skipped: SkippedCheck[]): { skipped?: SkippedCheck[] } {
  return skipped.length > 0 ? { skipped } : {};
}

/** What `--visual` measures in a browser, as a hint or a reason names it. */
export const RENDERED_RULES = "overflow, contrast, line breaks, and alignment";

/**
 * The rules a browser measures, when a run leaves them out: why, and `rerun`, the command that
 * measures them. Without Playwright, installing it comes first, whatever the reason was.
 */
export function visualSkipped(
  rerun: string,
  options: { reason: string; runner?: PlaywrightRunner },
): SkippedCheck {
  const measure = `run \`${rerun}\` to measure ${RENDERED_RULES}`;
  return playwrightReady(options.runner)
    ? { check: "visual", reason: options.reason, hint: measure }
    : {
        check: "visual",
        reason: "Playwright is not installed",
        hint: `${PLAYWRIGHT_INSTALL}, then ${measure}`,
      };
}

export type WriteSuccessOptions = {
  json: boolean;
  format?: string;
  /** Print diagnostic paths relative to this directory. SARIF keeps absolute URIs. */
  cwd?: string;
  /** The one deck the command worked on, which hints that name no path are about. */
  deck?: HintDeck;
  /** The flags it ran with, which a failure's rerun repeats where they change what is checked. */
  flags?: FlagValues;
};

/** Where a run's hints are read: the directory it ran in, and the deck it worked on, if one. */
export type HintSite = { cwd: string; deck?: HintDeck };

/**
 * A result whose hints run as written from where the command ran: see `addressHint`. A diagnostic
 * is about the deck its path is in; a skipped check, about the deck the command worked on.
 */
export function addressResult(result: CliResult, site: HintSite): CliResult {
  const data = result.data as { diagnostics?: Diagnostic[]; skipped?: SkippedCheck[] };
  if (data.diagnostics === undefined && data.skipped === undefined) {
    return result;
  }
  const address = <T extends { hint?: string }>(entry: T, deck: HintDeck | undefined): T =>
    entry.hint === undefined ? entry : { ...entry, hint: addressHint(entry.hint, deck, site.cwd) };
  return {
    ...result,
    data: {
      ...data,
      ...(data.diagnostics && {
        diagnostics: data.diagnostics.map((diagnostic) =>
          address(diagnostic, diagnosticDeck(diagnostic) ?? site.deck),
        ),
      }),
      ...(data.skipped && { skipped: data.skipped.map((entry) => address(entry, site.deck)) }),
    },
  } as CliResult;
}

function diagnosticDeck(diagnostic: Diagnostic): HintDeck | undefined {
  return diagnostic.path === undefined ? undefined : deckAround(diagnostic.path);
}

/**
 * Print a result: SARIF, the `--json` envelope, or text with what did not run on stderr.
 * Only lint and check fail on an error diagnostic; a build or a listing reports what lint
 * would say but still did its job: at the venue, a deck that shows is better than none. The
 * error has the shape a thrown one has, so `--json` readers branch on `ok` and read `error` alike.
 */
export function writeSuccess(original: CliResult, options: WriteSuccessOptions): void {
  const output = outputOf(original.command);
  const { cwd } = options;
  const addressed = cwd === undefined ? original : addressResult(original, { cwd, ...options });
  const result = cwd === undefined ? addressed : displayPaths(addressed, cwd);
  const failed = output.failure?.(result.data, options.flags ?? {});
  const failure =
    failed?.hint === undefined || cwd === undefined
      ? failed
      : { ...failed, hint: addressHint(failed.hint, options.deck, cwd) };
  if (options.format === "sarif" && output.sarif) {
    process.stdout.write(`${JSON.stringify(output.sarif(addressed.data))}\n`);
  } else if (options.json) {
    const envelope = failure ? { ok: false, error: failure } : { ok: true };
    const data = output.json ? output.json(result.data) : (result.data as object);
    process.stdout.write(`${JSON.stringify({ ...envelope, ...data })}\n`);
  } else {
    const plain = {
      ...result,
      data: plainStrings(result.data, isAboutRef(result.data)),
    } as CliResult;
    const text = formatText(plain, shouldColor(process.stdout));
    process.stdout.write(`${terminalSafe(text)}\n`);
    const notes = output.notes?.(plain.data, shouldColor(process.stderr));
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

/** A result that read a ref, as `ls`, `show`, and `theme` mark theirs. */
function isAboutRef(data: unknown): boolean {
  return typeof data === "object" && data !== null && "ref" in data && data.ref !== undefined;
}

/**
 * Every string in a result as plainText, so the text a deck or a ref wrote reaches the terminal
 * with no escape of its own; the text formatters paint dek's colors after. In a result about a
 * ref, each character a person cannot see shows as `⟨U+XXXX⟩` too.
 */
function plainStrings<T>(value: T, reveal: boolean): T {
  if (typeof value === "string") {
    const plain = plainText(value);
    return (reveal ? revealHidden(plain) : plain) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => plainStrings(entry, reveal)) as T;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, plainStrings(entry, reveal)]),
    ) as T;
  }
  return value;
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
  error = addressError(error, options.cwd);
  if (options.json) {
    const formatted = formatError(error, { cwd: options.cwd });
    process.stdout.write(`${JSON.stringify({ ok: false, error: formatted })}\n`);
  } else {
    const color = shouldColor(process.stderr);
    process.stderr.write(`${terminalSafe(formatErrorText(error, { color, cwd: options.cwd }))}\n`);
  }
  process.exitCode = 1;
}

/** A DekError whose hint runs as written from `cwd`, about the deck its path is in. */
function addressError(error: unknown, cwd: string): unknown {
  if (!(error instanceof DekError) || error.path === undefined || error.hint === undefined) {
    return error;
  }
  const hint = addressHint(error.hint, deckAround(error.path), cwd);
  return hint === error.hint
    ? error
    : new DekError(error.message, {
        path: error.path,
        hint,
        ...(error.line !== undefined ? { line: error.line } : {}),
        cause: error.cause,
      });
}
