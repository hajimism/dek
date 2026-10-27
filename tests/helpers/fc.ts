import { test } from "bun:test";
import { relative } from "node:path";
import fc from "fast-check";

/**
 * How every generated-input test runs, set in one place so the suite's cost and its seed are one
 * decision (ADR 29). Each property runs `RUNS` times from a seed chosen once per run of the suite.
 * A synchronous one gives up early, as passed, past `TIME_LIMIT_MS`. An asynchronous one runs every
 * run to its end: fast-check would stop waiting for the run in flight and leave it running into
 * the next test, so it names a count small enough to need no limit. A failure prints its seed, the
 * path to its shrunk counterexample, and the command that replays it. The variables are named for
 * fast-check, outside the `DEK_` namespace ADR 12 keeps for dek's users, and either of the first
 * two lifts the time limit, since a run asked for by hand is searched in full:
 *
 * - `FC_SEED`: run every property from this seed.
 * - `FC_NUM_RUNS`: run every property this many times instead, to search harder.
 * - `FC_PATH`: with `FC_SEED`, replay one failure straight to its counterexample.
 */
export type PropertySettings = {
  seed: number;
  path?: string;
  numRuns?: number;
  /** Past this, a synchronous property stops generating and passes with the runs it made. */
  timeLimitMs?: number;
};

/** What a property runs if it names no count of its own: fast-check's default. */
const RUNS = 100;
const TIME_LIMIT_MS = 5_000;

/** The settings `env` asks for; a fresh seed and the time limit when it names neither. */
export function propertySettings(env: Record<string, string | undefined>): PropertySettings {
  const seed = Number.parseInt(env.FC_SEED ?? "", 10);
  const numRuns = Number.parseInt(env.FC_NUM_RUNS ?? "", 10);
  const byHand = Number.isSafeInteger(seed) || numRuns > 0;
  return {
    seed: Number.isSafeInteger(seed) ? seed : (Date.now() ^ (Math.random() * 0x1_0000_0000)) | 0,
    ...(env.FC_PATH ? { path: env.FC_PATH } : {}),
    ...(numRuns > 0 ? { numRuns } : {}),
    ...(byHand ? {} : { timeLimitMs: TIME_LIMIT_MS }),
  };
}

const SETTINGS = propertySettings(process.env);

/** Where a property's test is: the file, relative to where `bun test` runs, and the test's name. */
type PropertyPlace = { file: string; name: string };

/**
 * fast-check's own report, with what the counterexample failed on, which Bun leaves out of an
 * error's `cause`, and the command that replays it.
 */
const reportWithReplay =
  <Ts>(place: PropertyPlace | undefined) =>
  (): fc.PluginInstance<Ts> => ({
    onAllRunsComplete(details) {
      if (!details.failed) {
        return;
      }
      const failure = details.errorInstance;
      const env = `FC_SEED=${details.seed}${details.counterexamplePath ? ` FC_PATH=${details.counterexamplePath}` : ""}`;
      const where = place
        ? `${place.file} -t ${shellWord(place.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))}`
        : "<this file>";
      throw new Error(
        [
          fc.defaultReportMessage(details),
          failure instanceof Error ? failure.message : String(failure ?? "no error"),
          `Replay it: ${env} bun test ${where}`,
        ].join("\n\n"),
        { cause: failure },
      );
    },
  });

/** `text` as one word of a shell command line. */
function shellWord(text: string): string {
  return `'${text.replaceAll("'", "'\\''")}'`;
}

type PropertyOptions = {
  /** Fewer runs, for a costly property. */
  runs?: number;
  settings?: PropertySettings;
  place?: PropertyPlace;
};

/** Checks `property` with the suite's settings, or `settings`. */
export function checkProperty<Ts>(
  property: fc.IRawProperty<Ts>,
  options: PropertyOptions = {},
): void | Promise<void> {
  const settings = options.settings ?? SETTINGS;
  const limit = property.isAsync() ? undefined : settings.timeLimitMs;
  return fc.assert(property, {
    seed: settings.seed,
    numRuns: settings.numRuns ?? options.runs ?? RUNS,
    ...(settings.path ? { path: settings.path, endOnFailure: true } : {}),
    plugins: [
      ...(limit === undefined ? [] : [fc.interruptAfterTimeLimit(limit) as fc.Plugin<Ts>]),
      reportWithReplay<Ts>(options.place),
    ],
  });
}

/**
 * A test that checks `property` and knows its own file and name, so a failure prints the command
 * that replays it. `serial` for one that swaps globals, as `runMain` does. A run asked for by hand
 * takes as long as it needs.
 */
export function propertyTest<Ts>(
  name: string,
  property: fc.IRawProperty<Ts>,
  options: { runs?: number; serial?: boolean } = {},
): void {
  const place = { file: callerFile(), name };
  const timeout = SETTINGS.timeLimitMs === undefined ? 2_147_483_647 : undefined;
  (options.serial ? test.serial : test)(
    name,
    () => checkProperty(property, { ...(options.runs ? { runs: options.runs } : {}), place }),
    timeout,
  );
}

/** The test file that called, from the stack. */
function callerFile(): string {
  for (const frame of new Error().stack?.split("\n") ?? []) {
    const file = /((?:\/|[A-Za-z]:\\)[^():]*\.test\.ts):\d+:\d+/.exec(frame)?.[1];
    if (file) {
      return relative(process.cwd(), file);
    }
  }
  return "<this file>";
}
