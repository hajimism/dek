import { join } from "node:path";
import { contractIssues, printedBy } from "../../src/cli/contract.ts";

export const cliPath = join(import.meta.dir, "..", "..", "src", "cli.ts");

export type RunResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function runDek(
  args: string[],
  options?: { cwd?: string; env?: Record<string, string> },
): Promise<RunResult> {
  // The Bun running the tests, not whichever `bun` PATH finds first; stdin closed so no run waits
  // on the runner's terminal or IPC pipe.
  const proc = Bun.spawn([process.execPath, cliPath, ...args], {
    cwd: options?.cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: options?.env ? { ...process.env, ...options.env } : undefined,
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (args.includes("--json")) {
    holdToContract(args, stdout);
  }
  return { exitCode, stdout, stderr };
}

/**
 * Every `--json` line a test makes dek print is held to the contract, so the suite as a whole
 * checks it: a field the contract does not name, or one it needs that is missing, fails the test
 * that printed it.
 */
function holdToContract(args: string[], stdout: string): void {
  const schema = printedBy(args);
  for (const line of stdout.split("\n").filter((text) => text.trim() !== "")) {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      throw new Error(`dek ${args.join(" ")} printed a line that is no JSON:\n${line}`);
    }
    const issues = contractIssues(schema, value);
    if (issues.length > 0) {
      throw new Error(
        `dek ${args.join(" ")} printed what src/cli/contract.ts does not name:\n${issues.join("\n")}\n${line}`,
      );
    }
  }
}

export function jsonStdout<T = unknown>(result: RunResult): T {
  return JSON.parse(result.stdout) as T;
}

const STOP_GRACE_MS = 3_000;
/**
 * A cold `bun src/cli.ts` starts in a tenth of a second alone but takes seconds on a loaded
 * machine. The wait only bounds a failure, so it is generous; a passing test never waits it out.
 */
const SERVER_READY_MS = 15_000;

export async function spawnDekServer(
  cwd: string,
  options: { args?: string[]; timeoutMs?: number; ready?: (buf: string) => boolean } = {},
): Promise<{ url: string; stdout: string; stop: () => Promise<void> }> {
  const proc = Bun.spawn([process.execPath, cliPath, ...(options.args ?? [])], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const stderr = new Response(proc.stderr).text();
  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) {
      return;
    }
    stopped = true;
    proc.kill();
    // A server that ignores SIGTERM must still not outlive the test that started it.
    const exited = await Promise.race([
      proc.exited.then(() => true),
      Bun.sleep(STOP_GRACE_MS).then(() => false),
    ]);
    if (!exited) {
      proc.kill("SIGKILL");
      await proc.exited;
    }
    await stderr.catch(() => "");
  };

  try {
    if (!proc.stdout || typeof proc.stdout === "number") {
      throw new Error("dek stdout is not a stream");
    }
    const stdout = await readUntilReady(
      proc.stdout,
      options.ready ?? ((buf) => /https?:\/\/\S+/.test(buf)),
      options.timeoutMs ?? SERVER_READY_MS,
    );
    const match = stdout.match(/https?:\/\/\S+/);
    if (!match?.[0]) {
      throw new Error(`no server URL in output: ${stdout}`);
    }
    return { url: match[0].replace(/[.,)]$/, ""), stdout, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}

async function readUntilReady(
  stdout: ReadableStream<Uint8Array>,
  ready: (buf: string) => boolean,
  timeoutMs: number,
): Promise<string> {
  const reader = stdout.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;

  const pump = (async () => {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        buf += decoder.decode();
        return;
      }
      buf += decoder.decode(chunk.value, { stream: true });
    }
  })();

  while (Date.now() < deadline) {
    if (ready(buf)) {
      return buf;
    }
    await Promise.race([pump, new Promise((resolve) => setTimeout(resolve, 20))]);
    if (ready(buf)) {
      return buf;
    }
  }

  throw new Error(`server output not ready: ${buf}`);
}
