import { realpathSync } from "node:fs";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { playwrightResolved } from "../../src/core/playwright.ts";
import { dekcReport, type Invocation, type RunReport, transcriptReport } from "./report.ts";
import { openProject, type Scenario, writeText } from "./scenario.ts";

/**
 * Claude Code, headless. `-p` takes the prompt on stdin, and stream-json needs `--verbose`.
 * Nothing can answer a permission prompt there and acceptEdits covers file edits only, so the
 * shell commands the scenarios need are allowed by name; anything else is refused and counted.
 */
export const DEFAULT_AGENT =
  "claude -p --output-format stream-json --verbose --permission-mode acceptEdits --allowedTools 'Bash(dekc:*)' 'Bash(bunx dekc:*)' 'Bash(cd:*)' 'Bash(ls:*)' 'Bash(cat:*)' 'Bash(cp:*)' 'Bash(mv:*)' 'Bash(mkdir:*)'";

/** Long enough for an agent that works the task through; a run past it is killed and reported. */
const TIMEOUT_MS = 15 * 60_000;

const SHIM = join(import.meta.dir, "shim.ts");

export type RunOptions = {
  /** A shell command; `{prompt}` and `{dir}` are replaced, and without `{prompt}` it is on stdin. */
  agent: string;
  /** Where this run's files are kept, under `<scenario>/<run>/`. */
  out: string;
  run: number;
  timeoutMs?: number;
};

/**
 * Makes the scenario's project in a fresh directory outside this repository, so the agent sees
 * none of dek's own guidance, puts the logging `dekc` first on its PATH, runs the agent there,
 * and checks what it left. The project as the agent left it is kept for reading.
 */
export async function runScenario(scenario: Scenario, options: RunOptions): Promise<RunReport> {
  const dir = join(options.out, scenario.id, String(options.run));
  await mkdir(dir, { recursive: true });
  const base = { scenario: scenario.id, run: options.run, dir };
  if (scenario.needsBrowser && !playwrightResolved()) {
    return {
      ...base,
      outcome: "skipped",
      reasons: ["Playwright is not installed: bunx playwright install chromium"],
      wallMs: 0,
      agent: { exitCode: null, timedOut: false },
      dekc: dekcReport([]),
    };
  }
  const root = realpathSync(await mkdtemp(join(tmpdir(), "dek-eval-")));
  try {
    const projectDir = join(root, "project");
    await mkdir(projectDir);
    const project = openProject(projectDir, scenario.env);
    await scenario.setup(project);
    const log = join(root, "dekc.jsonl");
    await writeText(log, "");
    const bin = await installShim(root, projectDir, log);
    const started = performance.now();
    const agent = await runAgent(options.agent, scenario.prompt, projectDir, {
      env: {
        ...process.env,
        ...scenario.env,
        PATH: `${bin}${delimiter}${process.env.PATH ?? ""}`,
      },
      transcript: join(dir, "transcript.jsonl"),
      stderr: join(dir, "agent.stderr"),
      timeoutMs: options.timeoutMs ?? TIMEOUT_MS,
    });
    const wallMs = performance.now() - started;
    const logged = await readFile(log, "utf8");
    await writeText(join(dir, "dekc.jsonl"), logged);
    const invocations = logged
      .split("\n")
      .filter((line) => line !== "")
      .map((line) => JSON.parse(line) as Invocation);
    const reasons = await scenario.check(project);
    await cp(projectDir, join(dir, "project"), {
      recursive: true,
      filter: (path) => !/\/node_modules(\/|$)/.test(path),
    });
    const transcript = transcriptReport(await readFile(join(dir, "transcript.jsonl"), "utf8"));
    return {
      ...base,
      outcome: reasons.length === 0 ? "passed" : "failed",
      reasons,
      wallMs,
      agent,
      dekc: dekcReport(invocations),
      ...(transcript ? { transcript } : {}),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/**
 * The `dekc` the agent runs: first on PATH, and in the project's node_modules/.bin, where
 * `bunx dekc` finds it from any directory in the project, as it would an installed dek.
 */
async function installShim(root: string, project: string, log: string): Promise<string> {
  const bin = join(root, "bin");
  const shim = join(bin, "dekc");
  await writeText(
    shim,
    `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(SHIM)} ${quote(log)} ${quote(project)} "$@"\n`,
  );
  await chmod(shim, 0o755);
  await mkdir(join(project, "node_modules", ".bin"), { recursive: true });
  await symlink(shim, join(project, "node_modules", ".bin", "dekc"));
  return bin;
}

async function runAgent(
  template: string,
  prompt: string,
  cwd: string,
  options: {
    env: Record<string, string | undefined>;
    transcript: string;
    stderr: string;
    timeoutMs: number;
  },
): Promise<RunReport["agent"]> {
  const command = template.replaceAll("{prompt}", quote(prompt)).replaceAll("{dir}", quote(cwd));
  // Its own process group, so a timeout or a server left running ends with everything it started.
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd,
    env: options.env,
    detached: true,
    stdin: template.includes("{prompt}") ? "ignore" : new Blob([prompt]),
    stdout: Bun.file(options.transcript),
    stderr: Bun.file(options.stderr),
  });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    killGroup(proc.pid);
  }, options.timeoutMs);
  const exitCode = await proc.exited;
  clearTimeout(timer);
  killGroup(proc.pid);
  return { exitCode: timedOut ? null : exitCode, timedOut };
}

function killGroup(pid: number): void {
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    // Every process in it has already exited.
  }
}

export function quote(text: string): string {
  return `'${text.replaceAll("'", `'\\''`)}'`;
}
