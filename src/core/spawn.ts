import { DekError } from "./error.ts";

/**
 * How dek runs bun: with no auto install, and without the working directory's `.env` or
 * `bunfig.toml`, which a repository someone else wrote can commit to set variables or preload code.
 * The dekc bin's shebang passes the last two to dek itself; a child does not inherit them.
 */
export const BUN_FLAGS = ["--no-install", "--no-env-file", "--config=/dev/null"];

/** `bin` as a command line: a .ts worker runs under bun, anything else as is. */
export function workerCommand(bin: string, args: string[] = []): string[] {
  return bin.endsWith(".ts") ? ["bun", ...BUN_FLAGS, bin, ...args] : [bin, ...args];
}

/** A browser that hangs must not hang dek; a whole visual run or capture fits well inside this. */
const DEFAULT_WORKER_TIMEOUT_MS = 10 * 60 * 1000;

/** How long a command stopped at its timeout has to exit on SIGTERM before it gets SIGKILL. */
const KILL_GRACE_MS = 2000;

/**
 * How long the output is still read once the command has exited. A process it started and left
 * running holds the pipes open as long as it lives, so what came by then is the output.
 */
const DRAIN_MS = 1000;

type PipedOptions = {
  /** The error message when the command cannot start or overruns, such as "ffmpeg failed". */
  label: string;
  /** The hint when the command cannot start. */
  hint: string;
  /** Written to the command's stdin, which is then closed. */
  stdin?: string;
  /** Covers the whole run, from spawn to exit. */
  timeoutMs: number;
  /** Where the command runs; dek's working directory when left out. */
  cwd?: string;
  /** The command's environment; left out, Bun passes the one dek started with. */
  env?: Record<string, string | undefined>;
};

type Piped = {
  stdout: string;
  stderr: string;
  exitCode: number;
  /** Set when the output was let go before it ended, `DRAIN_MS` after the command exited. */
  cutShort?: true;
};

/** What `runPiped` throws for a command it stopped at its timeout, unlike one that cannot start. */
export class OverrunError extends DekError {}

/**
 * Runs `cmd` to its exit with its output piped back. A command that cannot start, or runs past
 * `timeoutMs` and is killed, is a DekError named `label`; any exit code is the caller's to judge.
 */
export async function runPiped(cmd: string[], options: PipedOptions): Promise<Piped> {
  let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  try {
    proc = Bun.spawn(cmd, {
      ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
      ...(options.env !== undefined ? { env: options.env } : {}),
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    throw new DekError(options.label, { hint: options.hint, cause: error });
  }
  // Read before writing: a command that answers while still reading must not block on a full pipe.
  const output = readOutput(proc);
  const stop = stopAfter(proc, options.timeoutMs);
  const overrun = () =>
    new OverrunError(options.label, {
      hint: `it did not finish within ${Math.round(options.timeoutMs / 1000)}s and was stopped`,
    });
  try {
    if (options.stdin !== undefined) {
      proc.stdin.write(options.stdin);
    }
    await proc.stdin.end();
    const exitCode = await proc.exited;
    // It finished in time, however long what it left behind keeps the pipes open.
    stop.clear();
    const { stdout, stderr, cutShort } = await output.drain();
    if (stop.fired()) {
      throw overrun();
    }
    return { stdout, stderr, exitCode, ...(cutShort ? { cutShort } : {}) };
  } catch (error) {
    if (error instanceof DekError) {
      throw error;
    }
    // Killing the command breaks the pipe a write to its stdin was waiting on.
    if (stop.fired()) {
      throw overrun();
    }
    throw new DekError(options.label, { hint: options.hint, cause: error });
  } finally {
    stop.clear();
    output.cancel();
  }
}

/**
 * Stops `proc` once `timeoutMs` passes: SIGTERM, then SIGKILL if it is still running
 * `KILL_GRACE_MS` later. `clear` calls off the timeout, never a SIGKILL already on its way.
 *
 * Only the command is signalled, not what it started: a command that forks a child and is killed
 * leaves the child running. `bun add -d rumdl` puts a Node wrapper in front of rumdl that runs the
 * binary with spawnSync, so a rumdl that hangs is stopped and its binary lives on as an orphan;
 * the drain keeps it from holding dek. Killing the whole group would need the command in a session
 * of its own (`detached`), where the terminal's Ctrl-C no longer reaches it.
 */
function stopAfter(
  proc: Bun.Subprocess,
  timeoutMs: number,
): { fired: () => boolean; clear: () => void } {
  let fired = false;
  const timer = setTimeout(() => {
    fired = true;
    proc.kill();
    const kill = setTimeout(() => proc.kill("SIGKILL"), KILL_GRACE_MS);
    void proc.exited.finally(() => clearTimeout(kill));
  }, timeoutMs);
  return { fired: () => fired, clear: () => clearTimeout(timer) };
}

/**
 * The command's stdout and stderr, read as they come. `drain`, once it has exited, waits
 * `DRAIN_MS` at most for both to end, and says when it had to let go first (`cutShort`); `cancel`
 * lets go of both, which an open pipe needs before dek can exit.
 */
function readOutput(proc: Bun.Subprocess<"pipe", "pipe", "pipe">): {
  drain: () => Promise<{ stdout: string; stderr: string; cutShort: boolean }>;
  cancel: () => void;
} {
  const readers = [proc.stdout.getReader(), proc.stderr.getReader()];
  const texts = Promise.all(readers.map(readToEnd));
  // Awaited by `drain`; a read that fails before then must not go unhandled.
  texts.catch(() => {});
  const cancel = () => {
    for (const reader of readers) {
      reader.cancel().catch(() => {});
    }
  };
  return {
    drain: async () => {
      let cutShort = false;
      const timer = setTimeout(() => {
        cutShort = true;
        cancel();
      }, DRAIN_MS);
      try {
        const [stdout = "", stderr = ""] = await texts;
        return { stdout, stderr, cutShort };
      } finally {
        clearTimeout(timer);
      }
    },
    cancel,
  };
}

/** The text a reader reads until its stream ends or is cancelled. */
async function readToEnd(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      return text + decoder.decode();
    }
    text += decoder.decode(value, { stream: true });
  }
}

type JsonWorkerOptions = {
  /** The error message for any failure, such as "Playwright worker failed". */
  label: string;
  /** The hint when the worker gives no reason of its own. */
  hint: string;
  /** Covers the whole run, from spawn to exit. */
  timeoutMs?: number;
};

/**
 * Runs a worker that takes one JSON request on stdin and answers with JSON on
 * stdout. Every failure is a DekError named `label`: a worker that exits
 * non-zero contributes its stderr as the hint, one that overruns the timeout
 * is killed and says so, and output `parse` rejects is invalid JSON, or cut
 * short when a process the worker left behind held it open.
 */
export async function runJsonWorker<T>(
  cmd: string[],
  request: unknown,
  parse: (stdout: string) => T | null,
  options: JsonWorkerOptions,
): Promise<T> {
  const { stdout, stderr, exitCode, cutShort } = await runPiped(cmd, {
    label: options.label,
    hint: options.hint,
    stdin: JSON.stringify(request),
    timeoutMs: options.timeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS,
  });
  if (exitCode !== 0) {
    throw new DekError(options.label, { hint: stderr.trim().slice(0, 200) || options.hint });
  }
  const parsed = parse(stdout);
  if (parsed === null) {
    throw new DekError(options.label, {
      hint: cutShort
        ? "the worker exited while a process it started still held its output, so its answer was cut short; run the command again"
        : "worker returned invalid JSON",
    });
  }
  return parsed;
}

/** The worker's side of `runJsonWorker`: its request, or exit 2 with the reason on stderr. */
export async function readWorkerRequest<T>(): Promise<T> {
  const text = await new Response(Bun.stdin).text();
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    return exitWorker(error);
  }
}

/** Exits a worker with the reason on stderr, so the parent's hint says what went wrong. */
export function exitWorker(error: unknown): never {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(2);
}
