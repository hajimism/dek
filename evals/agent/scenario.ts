import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/** The dek under test: this checkout's CLI, run with the Bun running the harness. */
export const cliPath = join(import.meta.dir, "..", "..", "src", "cli.ts");

/**
 * One small broken project and the task a user would give an agent about it. The runner makes
 * the project with `setup`, hands `prompt` to the agent, and asks `check` whether it is done.
 */
export type Scenario = {
  id: string;
  /** The task in the words a user would type: no rule ids, no commands. */
  prompt: string;
  /** Its check measures in a browser: without Playwright the scenario is skipped, never passed. */
  needsBrowser?: boolean;
  /** Environment the agent and the check both run with, on top of the harness's own. */
  env?: Record<string, string>;
  /** Make the project in the empty `project.dir` and seed the one defect. */
  setup(project: Project): Promise<void>;
  /** What is still wrong once the agent has stopped; empty when the task is done. */
  check(project: Project): Promise<string[]>;
  /**
   * The known solution, as an agent would work it out: each string is a shell command run in the
   * project, each function an edit to its files. Only the fake agent in tests runs it.
   */
  solution: Step[];
};

type Step = string | ((dir: string) => Promise<void>);

export type Ran = { exitCode: number; stdout: string; stderr: string };

/** The project a scenario works on, and dek run on it by the harness, not the agent. */
export type Project = {
  dir: string;
  /** Runs dek directly, so the agent's log never counts the harness's own runs. */
  dekc(args: string[], options?: { cwd?: string }): Promise<Ran>;
  read(path: string): Promise<string | undefined>;
  write(path: string, text: string): Promise<void>;
};

export function openProject(dir: string, env: Record<string, string> = {}): Project {
  return {
    dir,
    async dekc(args, options) {
      const proc = Bun.spawn([process.execPath, cliPath, ...args], {
        cwd: join(dir, options?.cwd ?? "."),
        env: { ...process.env, ...env },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      return { exitCode, stdout, stderr };
    },
    read: (path) => readFile(join(dir, path), "utf8").catch(() => undefined),
    write: (path, text) => writeText(join(dir, path), text),
  };
}

export async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

/** A setup step that must work: the scenario is broken, not the agent, when it does not. */
export async function must(ran: Promise<Ran>, what: string): Promise<Ran> {
  const result = await ran;
  if (result.exitCode !== 0) {
    throw new Error(`${what} failed:\n${result.stderr || result.stdout}`);
  }
  return result;
}

type Diagnostic = { id: string; severity: string; message: string; path?: string };

type Envelope = {
  ok?: boolean;
  error?: { message: string };
  diagnostics?: Diagnostic[];
  skipped?: Array<{ check: string; reason: string }>;
};

/**
 * What a `--json` lint or check run says is still wrong: each error diagnostic, the error when
 * there are none, and every check in `needed` that was skipped, since a skipped check is no pass.
 */
export function problems(ran: Ran, needed: string[] = []): string[] {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(ran.stdout) as Envelope;
  } catch {
    return [`dek printed no JSON (exit ${ran.exitCode}): ${(ran.stderr || ran.stdout).trim()}`];
  }
  const errors = (envelope.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.severity === "error")
    .map((diagnostic) => `${diagnostic.path ?? ""}: ${diagnostic.id} ${diagnostic.message}`);
  const skipped = (envelope.skipped ?? [])
    .filter((entry) => needed.includes(entry.check))
    .map((entry) => `the ${entry.check} check was skipped: ${entry.reason}`);
  const failed =
    errors.length === 0 && envelope.ok === false && envelope.error ? [envelope.error.message] : [];
  return [...errors, ...failed, ...skipped];
}

/** What `dekc lint` from the project root says is still wrong; `visual` adds the browser rules. */
export async function lintProblems(project: Project, options: { visual?: boolean } = {}) {
  return (await lintFindings(project, options)).problems;
}

/**
 * One `dekc lint --json` from the project root: what `problems` makes of it, and each of its
 * diagnostics, warnings too, for a task that is done only once a warning is gone. Lint passes
 * with warnings, so a check that cares about one must look for it here.
 */
export async function lintFindings(
  project: Project,
  options: { visual?: boolean } = {},
): Promise<{ problems: string[]; diagnostics: Diagnostic[] }> {
  const ran = await project.dekc(["lint", "--json", ...(options.visual ? ["--visual"] : [])]);
  let diagnostics: Diagnostic[] = [];
  try {
    diagnostics = (JSON.parse(ran.stdout) as Envelope).diagnostics ?? [];
  } catch {
    // `problems` says that lint printed no JSON.
  }
  return { problems: problems(ran, options.visual ? ["visual"] : []), diagnostics };
}

/** Each diagnostic of the rules in `ids`, as a check reports it. */
export function warned(diagnostics: Diagnostic[], ids: string[]): string[] {
  return diagnostics
    .filter((diagnostic) => ids.includes(diagnostic.id))
    .map(
      (diagnostic) =>
        `${diagnostic.path ?? ""}: ${diagnostic.id} ${diagnostic.severity}: ${diagnostic.message}`,
    );
}
