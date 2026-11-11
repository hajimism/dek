import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { type EvalReport, type RunReport, repeatCount } from "./report.ts";

/**
 * One scenario's runs as numbers, to keep in the repository and compare across releases. Medians
 * are over the runs that were not skipped, and null when every run was.
 */
type ScenarioSummary = {
  id: string;
  /** Runs that were made, skipped ones left out. */
  runs: number;
  passed: number;
  skipped: number;
  medianWallMs: number | null;
  medianDekcRuns: number | null;
  medianRepeats: number | null;
  /** Errors dek showed with no hint, over every run. */
  unhintedErrors: number;
  /** A lint that could not look counts as one error here. */
  medianErrorsLeft: number | null;
  /** Over the runs whose lint could look; null when none could. */
  medianWarningsLeft: number | null;
};

/**
 * What `--record` keeps: no paths, no transcripts, and nothing the agent wrote, so the file can
 * be committed as it is. The agent's command is left out as well, since it may name a path.
 */
export type Summary = {
  /** The dek that was measured, from package.json: bumped only by the release pull request. */
  dek: string;
  /** The checkout that was measured, as `git rev-parse --short HEAD`; null outside a git checkout. */
  commit: string | null;
  /** The day the eval started, in UTC, as `startedAt` is; not the local day. */
  date: string;
  scenarios: ScenarioSummary[];
};

export function summarize(
  report: EvalReport,
  measured: { dek: string; commit: string | null },
): Summary {
  return {
    dek: measured.dek,
    commit: measured.commit,
    date: report.startedAt.slice(0, 10),
    scenarios: report.scenarios.map(({ id, runs }) => {
      const ran = runs.filter((run) => run.outcome !== "skipped");
      const middle = (value: (run: RunReport) => number): number | null => median(ran.map(value));
      return {
        id,
        runs: ran.length,
        passed: ran.filter((run) => run.outcome === "passed").length,
        skipped: runs.length - ran.length,
        medianWallMs: middle((run) => Math.round(run.wallMs)),
        medianDekcRuns: middle((run) => run.dekc.invocations),
        medianRepeats: middle((run) => repeatCount(run.dekc)),
        unhintedErrors: ran.reduce((sum, run) => sum + run.dekc.unhinted.length, 0),
        medianErrorsLeft: middle((run) => run.left.errors),
        medianWarningsLeft: median(
          ran.flatMap((run) => (run.left.warnings === null ? [] : [run.left.warnings])),
        ),
      };
    }),
  };
}

function median(values: number[]): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  const half = Math.floor(sorted.length / 2);
  if (sorted.length === 0) {
    return null;
  }
  return sorted.length % 2 === 1
    ? (sorted[half] ?? null)
    : ((sorted[half - 1] ?? 0) + (sorted[half] ?? 0)) / 2;
}

/**
 * Writes `summary` into `dir` as `<date>-v<dek>.json`, or with `-2`, `-3`, … when a record of that
 * day and version is kept, and returns its path. Each name is taken by creating the file only if
 * it is not there, so a record made at the same moment is never overwritten either.
 */
export async function writeRecord(dir: string, summary: Summary): Promise<string> {
  await mkdir(dir, { recursive: true });
  const text = `${JSON.stringify(summary, null, 2)}\n`;
  const stem = `${summary.date}-v${summary.dek}`;
  for (let count = 1; ; count++) {
    const path = join(dir, count === 1 ? `${stem}.json` : `${stem}-${count}.json`);
    try {
      await writeFile(path, text, { flag: "wx" });
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
}
