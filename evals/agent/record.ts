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
  medianWarningsLeft: number | null;
};

/**
 * What `--record` keeps: no paths, no transcripts, and nothing the agent wrote, so the file can
 * be committed as it is. The agent's command is left out as well, since it may name a path.
 */
export type Summary = {
  /** The dek that was measured, from package.json. */
  dek: string;
  /** The day the eval started, in UTC. */
  date: string;
  scenarios: ScenarioSummary[];
};

export function summarize(report: EvalReport, dek: string): Summary {
  return {
    dek,
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
        medianWarningsLeft: middle((run) => run.left.warnings),
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

/** `<date>-v<dek>.json`, or with `-2`, `-3`, … when a record of that day and version is kept. */
export function recordName(summary: Summary, taken: (name: string) => boolean): string {
  const stem = `${summary.date}-v${summary.dek}`;
  let name = `${stem}.json`;
  for (let count = 2; taken(name); count++) {
    name = `${stem}-${count}.json`;
  }
  return name;
}
