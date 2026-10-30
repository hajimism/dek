/**
 * The Claude Code hook for working on dek, set in .claude/settings.json:
 *
 *   bun scripts/agent-hooks.ts stop  # Stop: run the tests of what the turn changed
 *
 * When a turn ends with changes, the test files that import a changed file, and the changed test
 * files, run; if one fails, the agent is stopped once with what failed, until the files change
 * again. The full suite stays CI's.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { importers, parseStatus, testsFor } from "./related-tests.ts";

const ROOT = join(import.meta.dir, "..");
const STATE_DIR = join(ROOT, ".cache", "agent-hooks");
/** Past this many test files, a turn's change is the suite's to check, in CI or by hand. */
const STOP_LIMIT = 40;

type HookInput = { stop_hook_active?: boolean };

async function main(argv: readonly string[]): Promise<number> {
  if (argv[0] === "stop") return stop(await input());
  console.error(
    "usage: bun scripts/agent-hooks.ts stop\n" +
      "stop takes the hook's JSON on stdin; .claude/settings.json runs it",
  );
  return 2;
}

async function input(): Promise<HookInput> {
  const text = await Bun.stdin.text();
  return text.trim() ? (JSON.parse(text) as HookInput) : {};
}

async function stop(hook: HookInput): Promise<number> {
  // Already stopped once in this chain: let the turn end.
  if (hook.stop_hook_active) return 0;
  const changed = await changedFiles();
  if (changed.length === 0) return 0;
  const run = testsFor(ROOT, changed, importers(ROOT));
  if (run.length === 0) return 0;
  if (run.length > STOP_LIMIT) {
    console.log(
      JSON.stringify({
        systemMessage: `dek: ${plural(run.length, "test file")} import what changed, too many to run at the end of a turn; run the suite with \`bun run test\``,
      }),
    );
    return 0;
  }
  const stateFile = join(STATE_DIR, "stop.json");
  const key = stateKey(changed, run);
  if (readJson<{ key: string }>(stateFile)?.key === key) return 0;

  const command = [
    "bun",
    "test",
    "--timeout=20000",
    ...(run.length > 1 ? ["--parallel=4"] : []),
    ...run,
  ];
  const proc = Bun.spawn(command, { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const passed = (await proc.exited) === 0;
  writeJson(stateFile, { key, passed });
  if (passed) return 0;

  console.log(
    JSON.stringify({ decision: "block", reason: failureReport(`${out}\n${err}`, run, command) }),
  );
  return 0;
}

/** The .ts files under src/ and tests/ that differ from HEAD, untracked ones included. */
async function changedFiles(): Promise<string[]> {
  const proc = Bun.spawn(["git", "status", "--porcelain=v1", "-z", "--untracked-files=all"], {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "ignore",
  });
  const output = await new Response(proc.stdout).text();
  if ((await proc.exited) !== 0) return [];
  return parseStatus(output).filter(
    (path) => (path.startsWith("src/") || path.startsWith("tests/")) && path.endsWith(".ts"),
  );
}

/** Changes with the files, and with which tests run over them. */
function stateKey(changed: readonly string[], run: readonly string[]): string {
  const hasher = new Bun.CryptoHasher("sha256");
  for (const path of [...new Set([...changed, ...run])].sort()) {
    hasher.update(`${path}\0`);
    try {
      hasher.update(readFileSync(join(ROOT, path)));
    } catch {
      hasher.update("\0deleted\0");
    }
  }
  hasher.update(`\0${run.join("\0")}`);
  return hasher.digest("hex");
}

export function failureReport(
  output: string,
  run: readonly string[],
  command: readonly string[],
): string {
  const lines = output.replace(/\x1b\[[0-9;]*m/g, "").split("\n");
  // A failed test's line, without the time it took.
  const failed = [
    ...new Set(
      lines
        .filter((line) => line.startsWith("(fail) "))
        .map((line) => line.replace(/ \[[\d.]+m?s\]$/, "")),
    ),
  ];
  const shown = failed.slice(0, 15);
  const detail =
    failed.length > 0
      ? [
          ...shown,
          ...(failed.length > shown.length ? [`${failed.length - shown.length} more`] : []),
        ]
      : lines.filter((line) => line.trim()).slice(-20);
  return [
    `dek: the tests of what this turn changed fail (${plural(run.length, "test file")} ran: the changed ones and those importing a changed file).`,
    ...detail,
    `Run them again: ${command.join(" ")}`,
    "Fix the code, or the test when the change in behavior is meant. You are stopped once for these files as they are now.",
  ].join("\n");
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function readJson<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return undefined;
  }
}

function writeJson(file: string, value: unknown): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(file, `${JSON.stringify(value)}\n`);
}

if (import.meta.main) process.exitCode = await main(process.argv.slice(2));
