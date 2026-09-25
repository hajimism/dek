import { DekError } from "./error.ts";

export async function awaitPiped(proc: {
  stdout: ReadableStream<Uint8Array> | number;
  stderr: ReadableStream<Uint8Array> | number;
  exited: Promise<number>;
}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout as ReadableStream<Uint8Array>).text(),
    new Response(proc.stderr as ReadableStream<Uint8Array>).text(),
    proc.exited,
  ]);
  return { stdout, stderr, exitCode };
}

/** `bin` as a command line: a .ts worker runs under bun, anything else as is. */
export function workerCommand(bin: string, args: string[] = []): string[] {
  return bin.endsWith(".ts") ? ["bun", "--no-install", bin, ...args] : [bin, ...args];
}

/** A browser that hangs must not hang dek; a whole visual run or capture fits well inside this. */
export const DEFAULT_WORKER_TIMEOUT_MS = 10 * 60 * 1000;

export type JsonWorkerOptions = {
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
 * is killed and says so, and output `parse` rejects is invalid JSON.
 */
export async function runJsonWorker<T>(
  cmd: string[],
  request: unknown,
  parse: (stdout: string) => T | null,
  options: JsonWorkerOptions,
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_WORKER_TIMEOUT_MS;
  let proc: Bun.Subprocess<"pipe", "pipe", "pipe">;
  try {
    proc = Bun.spawn(cmd, { stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    throw new DekError(options.label, { hint: options.hint, cause: error });
  }
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);
  try {
    const piped = awaitPiped(proc);
    proc.stdin.write(JSON.stringify(request));
    await proc.stdin.end();
    const { stdout, stderr, exitCode } = await piped;
    if (timedOut) {
      throw new DekError(options.label, {
        hint: `the worker did not finish within ${Math.round(timeoutMs / 1000)}s and was stopped`,
      });
    }
    if (exitCode !== 0) {
      throw new DekError(options.label, { hint: stderr.trim().slice(0, 200) || options.hint });
    }
    const parsed = parse(stdout);
    if (parsed === null) {
      throw new DekError(options.label, { hint: "worker returned invalid JSON" });
    }
    return parsed;
  } catch (error) {
    if (error instanceof DekError) {
      throw error;
    }
    throw new DekError(options.label, { hint: options.hint, cause: error });
  } finally {
    clearTimeout(timer);
  }
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
