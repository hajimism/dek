/**
 * Time the commands an agent runs over and over, on the sample decks:
 *
 *   bun scripts/bench.ts [--runs <n>]
 *
 * Copies sample/ to a temporary directory, so the checkout is left as it was, and runs this
 * checkout's `dekc lint`, `dekc lint --visual`, `dekc check` on each deck's first slide, and
 * `dekc build`, each with `--json` and in a process of its own, as an agent runs them: once to
 * warm up, then n times (5 unless given). Each is timed twice: with the deck's .cache removed
 * before every run, as after an edit, and with it kept, as when nothing changed. Prints the
 * median, fastest, and slowest run of each as JSON on stdout, and adds them as a table to
 * GITHUB_STEP_SUMMARY when that is set. A record to compare against, not a gate: nothing here
 * fails on a time.
 */
import { appendFile, cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const cli = join(root, "src", "cli.ts");
const WARMUPS = 1;

type Cache = "cold" | "warm";

type Timing = {
  deck: string;
  command: string;
  args: string[];
  /** `cold` with the deck's .cache removed before every run; `warm` with it kept. */
  cache: Cache;
  /** Whether every run passed; a run with errors among its findings still did the work. */
  ok: boolean;
  /** The checks a run left out, such as rumdl when it is not installed: what was not timed. */
  skipped: string[];
  runsMs: number[];
  medianMs: number;
  minMs: number;
  maxMs: number;
};

/** What the script prints: the timings, and what they were taken on, to compare like with like. */
type Report = {
  /** When the timing ended, as an ISO 8601 timestamp. */
  date: string;
  /** The checkout's commit, or null outside a git checkout. */
  commit: string | null;
  /** Bun.version, process.platform, and process.arch of the Bun that ran the commands. */
  bun: string;
  platform: string;
  arch: string;
  /** How many logical CPUs the machine has, and the first one's model. */
  cpus: number;
  cpu: string;
  /** The runs of each command left untimed before the timed ones. */
  warmups: number;
  /** The timed runs of each command. */
  runs: number;
  timings: Timing[];
};

type Printed = { ok?: unknown; diagnostics?: unknown; skipped?: { check: string }[] } & Record<
  string,
  unknown
>;

function runsFrom(argv: string[]): number {
  if (argv.length === 0) {
    return 5;
  }
  const [flag, value, ...rest] = argv;
  const runs = Number(value);
  if (flag !== "--runs" || !Number.isInteger(runs) || runs < 1 || rest.length > 0) {
    throw new Error(`cannot read ${argv.join(" ")}; give --runs <n>, n a whole number from 1`);
  }
  return runs;
}

/** One run of `dekc <args>` in `cwd`: how long it took, start to exit, and the line it printed. */
async function run(args: string[], cwd: string): Promise<{ ms: number; printed: Printed }> {
  const start = Bun.nanoseconds();
  const proc = Bun.spawn([process.execPath, cli, ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  const ms = (Bun.nanoseconds() - start) / 1e6;
  let printed: Printed;
  try {
    printed = JSON.parse(stdout.trim().split("\n").at(-1) ?? "");
  } catch {
    throw new Error(`dekc ${args.join(" ")} printed no JSON: ${(stderr || stdout).trim()}`);
  }
  // Findings still time the work; a command that could not run timed nothing.
  if (printed.ok !== true && !Array.isArray(printed.diagnostics)) {
    throw new Error(`dekc ${args.join(" ")} could not run: ${JSON.stringify(printed.error)}`);
  }
  return { ms, printed };
}

async function time(
  deck: string,
  args: string[],
  cwd: string,
  runs: number,
  cache: Cache,
): Promise<Timing> {
  const once = async () => {
    if (cache === "cold") {
      await rm(join(cwd, "decks", deck, ".cache"), { recursive: true, force: true });
    }
    return run(args, cwd);
  };
  for (let i = 0; i < WARMUPS; i++) {
    await once();
  }
  const results = [];
  for (let i = 0; i < runs; i++) {
    results.push(await once());
  }
  const runsMs = results.map(({ ms }) => Math.round(ms * 10) / 10);
  const sorted = [...runsMs].sort((a, b) => a - b);
  const middle = sorted.length / 2;
  const median = Number.isInteger(middle)
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[Math.floor(middle)] ?? 0);
  return {
    deck,
    command: args[0] ?? "",
    args,
    cache,
    ok: results.every(({ printed }) => printed.ok === true),
    skipped: [
      ...new Set(results.flatMap(({ printed }) => (printed.skipped ?? []).map((s) => s.check))),
    ],
    runsMs,
    medianMs: Math.round(median * 10) / 10,
    minMs: sorted[0] ?? 0,
    maxMs: sorted.at(-1) ?? 0,
  };
}

function commit(): string | null {
  const head = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" });
  return head.exitCode === 0 ? head.stdout.toString().trim() : null;
}

function table(timings: Timing[], heading: string): string {
  const rows = timings.map(
    (t) =>
      `| ${t.deck} | \`dekc ${t.args.join(" ")}\` | ${t.cache} | ${t.medianMs} | ${t.minMs} | ` +
      `${t.maxMs} | ` +
      `${t.ok ? "yes" : "no"} | ${t.skipped.join(", ") || "none"} |`,
  );
  return [
    "### Timings on the sample decks",
    "",
    heading,
    "",
    "| Deck | Command | Cache | Median (ms) | Fastest (ms) | Slowest (ms) | Passed | Skipped |",
    "| --- | --- | --- | ---: | ---: | ---: | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

async function main(): Promise<void> {
  const runs = runsFrom(process.argv.slice(2));
  const work = await mkdtemp(join(tmpdir(), "dek-bench-"));
  try {
    const sample = join(work, "sample");
    await cp(join(root, "sample"), sample, {
      recursive: true,
      filter: (source) => !/[/\\](node_modules|dist|\.cache)$/.test(source),
    });
    const decks = (await readdir(join(sample, "decks"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    const timings: Timing[] = [];
    for (const deck of decks) {
      const { printed } = await run(["ls", deck, "--json"], sample);
      const slug = (printed.sections as { slug: string }[] | undefined)?.[0]?.slug;
      if (slug === undefined) {
        throw new Error(`sample/decks/${deck} has no slide to check`);
      }
      for (const args of [
        ["lint", deck],
        // What AGENTS.md has an agent pass before it calls a deck done.
        ["lint", "--visual", deck],
        ["check", deck, slug],
        ["build", deck],
      ]) {
        for (const cache of ["cold", "warm"] as const) {
          timings.push(await time(deck, [...args, "--json"], sample, runs, cache));
        }
      }
    }
    const machine = { bun: Bun.version, platform: process.platform, arch: process.arch };
    const cores = cpus();
    const report: Report = {
      date: new Date().toISOString(),
      commit: commit(),
      ...machine,
      cpus: cores.length,
      cpu: cores[0]?.model ?? "",
      warmups: WARMUPS,
      runs,
      timings,
    };
    console.log(JSON.stringify(report, null, 2));
    const summary = process.env.GITHUB_STEP_SUMMARY;
    if (summary) {
      const heading =
        `Bun ${machine.bun} on ${machine.platform} ${machine.arch}, ${cores.length} CPUs, at ` +
        `${report.commit?.slice(0, 7) ?? "an unknown commit"}: ${runs} timed runs of each after ` +
        `${WARMUPS} to warm up. Cold removes the deck's .cache before every run; warm keeps it.`;
      await appendFile(summary, table(timings, heading));
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  console.error("hint: run it from this checkout after `bun install`, as `bun scripts/bench.ts`");
  process.exitCode = 1;
}
