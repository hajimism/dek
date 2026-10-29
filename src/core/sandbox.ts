import { DekError } from "./error.ts";
import { runJsonWorker } from "./spawn.ts";

/**
 * Set to 1, the user accepts that Chromium draws without its sandbox where the sandbox cannot
 * start, as in a container running as root: a ref's slides too, which are refused otherwise, and
 * the project's own with no warning. Read only from the environment dek starts in (ADR 12).
 */
const ALLOW_UNSANDBOXED = "DEK_ALLOW_UNSANDBOXED";

/**
 * What a Playwright worker is told of Chromium's sandbox: draw only inside it, or inside it where
 * it starts and without it where it does not. A worker told anything else requires it.
 */
export type SandboxMode = "required" | "preferred";

/** Chromium drew without its sandbox: why, in Chromium's words, and how to have it back. */
type Unsandboxed = { reason: string; hint: string };

function accepted(): boolean {
  return process.env[ALLOW_UNSANDBOXED] === "1";
}

/**
 * How a worker may draw: a ref's slide scripts are someone else's, so only in the sandbox unless
 * the user accepted otherwise; the project's own wherever Chromium starts (ADR 29).
 */
export function sandboxMode(ref: boolean): SandboxMode {
  return ref && !accepted() ? "required" : "preferred";
}

/**
 * What Chromium says when its sandbox cannot start: as root, without user namespaces, or with its
 * SUID helper set up wrong; then what Playwright 1.64 puts in place of Chromium's log when it holds
 * one of those, which the call log after it still holds.
 */
const SANDBOX_SAYS = [
  /No usable sandbox!|Running as root without --no-sandbox|SUID sandbox helper|Failed to move to new namespace|Received invalid process ID for zygote/,
  /Chromium sandboxing failed!/,
];

/** A line Chromium wrote to stderr, as Playwright's call log marks it, or one it logged as FATAL. */
const CHROMIUM_SAYS = /\[err\]|FATAL/;

/** The most of a line a reason keeps, in whole sentences; it keeps the first however long. */
const REASON_CHARS = 280;

/** A sentence: up to a `.`, `!`, or `?` that ends a word, outside parentheses, as `(0 vs. 1)` is. */
const SENTENCE = /(?:\([^)]*\)|\((?!\)|$)|[^()!?.]|[.!?](?!\s|$))+(?:[.!?]+|$)/g;

/**
 * What Chromium said when it failed: its words for a sandbox that cannot start, else its first
 * line of error, past the call log's `- [pid=…][err]` and its own `[…:FATAL:…]`. Undefined when
 * it said nothing, as when Playwright found no Chromium to start.
 */
export function chromiumFailure(error: unknown): string | undefined {
  const lines = (error instanceof Error ? error.message : String(error)).split("\n");
  for (const pattern of [...SANDBOX_SAYS, CHROMIUM_SAYS]) {
    const line = lines.find((text) => pattern.test(text));
    if (line !== undefined) {
      return sentences(line.replace(/^[\s-]*(?:\[[^\]]*\]\s*)*/, ""));
    }
  }
  return undefined;
}

/**
 * Why a launch failed, in a line: what Chromium said, else the first line of Playwright's error.
 * Never the command line Playwright's call log opens with, or its advice to launch without the
 * sandbox.
 */
export function launchFailure(error: unknown): string {
  const first = (error instanceof Error ? error.message : String(error)).split("\n")[0] ?? "";
  return chromiumFailure(error) ?? sentences(first);
}

function sentences(text: string): string {
  let kept = "";
  for (const [found] of text.trim().matchAll(SENTENCE)) {
    const sentence = found.trim();
    const next = kept ? `${kept} ${sentence}` : sentence;
    if (kept && next.length > REASON_CHARS) {
      break;
    }
    kept = next;
  }
  return kept || text.trim();
}

const GENERAL_HELP =
  "run dekc where Chromium's sandbox can start: as a user other than root, with user namespaces allowed (on Ubuntu 23.10 and later, `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`)";

/** What lets the sandbox start, for what Chromium said. */
function sandboxHelp(reason: string): string {
  if (/Running as root/.test(reason)) {
    return "run dekc as a user other than root, where Chromium's sandbox can start";
  }
  if (/No usable sandbox|namespace|zygote|AppArmor/i.test(reason)) {
    return "let Chromium make user namespaces: on Ubuntu 23.10 and later, `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`, or an AppArmor profile for it; in a container, a seccomp profile that allows them";
  }
  return GENERAL_HELP;
}

/** How to have the sandbox back, and while the user has not, how to accept going without it. */
function unsandboxedHint(reason: string): string {
  const help = sandboxHelp(reason);
  return accepted() ? help : `${help}; or set ${ALLOW_UNSANDBOXED}=1 to accept drawing without it`;
}

/** Why Chromium drew without its sandbox in this run, once it has; see `takeUnsandboxed`. */
let drewUnsandboxed: string | undefined;

/**
 * Says on stderr that Chromium drew without its sandbox, once a run, as lint --visual starts a
 * worker or two per deck and the dev server one per pass; and keeps why, for the result. The
 * project's own pages go unsaid once the user accepted it, a ref's never: it is someone else's code.
 */
function noteUnsandboxed(reason: string, ref: boolean): void {
  if (drewUnsandboxed === undefined && (ref || !accepted())) {
    process.stderr.write(
      ref
        ? `warning: Chromium drew a ref without its sandbox, as ${ALLOW_UNSANDBOXED}=1 lets it: ${reason}\n  help: ${sandboxHelp(reason)}\n`
        : `warning: Chromium drew without its sandbox, which did not start here: ${reason}\n  help: ${unsandboxedHint(reason)}\n`,
    );
  }
  drewUnsandboxed = reason;
}

/**
 * `{ unsandboxed }` when Chromium drew without its sandbox since the last call, for the result's
 * `--json`, and nothing otherwise, as `skipped` is absent when every check ran. Each call starts
 * the next run afresh.
 */
export function takeUnsandboxed(): { unsandboxed?: Unsandboxed } {
  const reason = drewUnsandboxed;
  drewUnsandboxed = undefined;
  return reason === undefined ? {} : { unsandboxed: { reason, hint: unsandboxedHint(reason) } };
}

/**
 * A worker's answer and why it drew without the sandbox; or, having drawn nothing, why the
 * sandbox did not start, and why Chromium did not start without it either when it tried.
 */
type Drawn<T> =
  | { answer: T; unsandboxed?: string }
  | { refused: string }
  | { failed: string; unsandboxed: string };

/** The worker's JSON as `parse` reads it, with what it says of the sandbox. */
function readDrawn<T>(
  text: string,
  sandbox: SandboxMode,
  parse: (text: string) => T | null,
): Drawn<T> | null {
  let said: { unsandboxed?: unknown; failed?: unknown } | null;
  try {
    said = JSON.parse(text);
  } catch {
    return null;
  }
  const { unsandboxed, failed } = said ?? {};
  if (unsandboxed !== undefined && typeof unsandboxed !== "string") {
    return null;
  }
  if (typeof unsandboxed === "string" && typeof failed === "string") {
    return { failed, unsandboxed };
  }
  if (unsandboxed !== undefined && sandbox === "required") {
    return { refused: unsandboxed };
  }
  const answer = parse(text);
  return answer === null ? null : { answer, ...(unsandboxed === undefined ? {} : { unsandboxed }) };
}

/**
 * Runs a Playwright worker as `runJsonWorker` does, telling it how it may draw: `ref` pages only in
 * Chromium's sandbox unless the user accepted otherwise. A draw without the sandbox is said and
 * kept for the result; a ref's pages the sandbox could not hold are refused, undrawn.
 */
export async function runDrawingWorker<T>(
  cmd: string[],
  request: object,
  parse: (text: string) => T | null,
  options: Parameters<typeof runJsonWorker>[3] & { ref?: boolean },
): Promise<T> {
  const { ref = false, ...worker } = options;
  const sandbox = sandboxMode(ref);
  const drawn = await runJsonWorker(
    cmd,
    { ...request, sandbox },
    (text) => readDrawn(text, sandbox, parse),
    worker,
  );
  if ("failed" in drawn) {
    const first =
      drawn.failed === drawn.unsandboxed ? "" : `; with it, Chromium said: ${drawn.unsandboxed}`;
    throw new DekError(`Chromium did not start, with its sandbox or without: ${drawn.failed}`, {
      hint: `${worker.hint}${first}`,
    });
  }
  if ("refused" in drawn) {
    // A failure that names no sandbox may be Chromium missing as well.
    const missing = /sandbox|namespace|zygote|as root/i.test(drawn.refused)
      ? ""
      : `${worker.hint}; or `;
    throw new DekError(
      `Chromium did not start with its sandbox here, and a ref is drawn only inside it: ${drawn.refused}`,
      {
        hint: `${missing}${sandboxHelp(drawn.refused)}; if you accept running this ref's slide scripts without the sandbox, set ${ALLOW_UNSANDBOXED}=1 and run again`,
      },
    );
  }
  if (drawn.unsandboxed !== undefined) {
    noteUnsandboxed(drawn.unsandboxed, ref);
  }
  return drawn.answer;
}
