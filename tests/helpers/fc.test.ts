import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { checkProperty, propertySettings, propertyTest } from "./fc.ts";

const place = { file: "tests/core/x.test.ts", name: "reads (it) back" };

/** What a property that fails from 10 up threw, run with `settings`. */
function failureOf(settings: ReturnType<typeof propertySettings>): string {
  try {
    checkProperty(
      fc.property(fc.nat(1000), (n) => n < 10),
      { runs: 200, settings, place },
    );
  } catch (error) {
    return String((error as Error).message);
  }
  throw new Error("expected the property to fail");
}

describe("checkProperty", () => {
  test("a failure prints the command that replays it, and the command does", () => {
    const first = failureOf(propertySettings({ FC_SEED: "42" }));
    expect(first).toContain("Counterexample: [10]");
    const replay =
      /Replay it: FC_SEED=(-?\d+) FC_PATH=(\S+) bun test tests\/core\/x\.test\.ts -t 'reads \\\(it\\\) back'$/m.exec(
        first,
      );
    expect(replay?.[1]).toBe("42");
    const again = failureOf(
      propertySettings({ FC_SEED: replay?.[1] ?? "", FC_PATH: replay?.[2] ?? "" }),
    );
    expect(again).toContain("Counterexample: [10]");
    // Replayed by its path, the run goes straight to the counterexample.
    expect(again).toContain("Property failed after 1 tests");
  });

  // fast-check's time limit stops waiting for an asynchronous run without stopping it, so one past
  // the limit would go on into the next test; an asynchronous property runs every run to its end.
  test("leaves no asynchronous run going when it returns, past the time limit too", async () => {
    let running = 0;
    let finished = 0;
    await checkProperty(
      fc.asyncProperty(fc.nat(), async () => {
        running++;
        await Bun.sleep(10);
        running--;
        finished++;
      }),
      { runs: 20, settings: { seed: 1, timeLimitMs: 30 } },
    );
    expect({ running, finished }).toEqual({ running: 0, finished: 20 });
  });
});

describe("propertySettings", () => {
  test("takes a seed and a count from the environment, either lifting the time limit", () => {
    expect(propertySettings({ FC_SEED: "-7", FC_NUM_RUNS: "3" })).toEqual({
      seed: -7,
      numRuns: 3,
    });
    expect(propertySettings({ FC_SEED: "5" }).timeLimitMs).toBeUndefined();
    expect(propertySettings({ FC_NUM_RUNS: "9" }).timeLimitMs).toBeUndefined();
    const fresh = propertySettings({});
    expect(Number.isSafeInteger(fresh.seed)).toBe(true);
    expect(fresh.timeLimitMs).toBe(5_000);
  });
});

describe("propertyTest", () => {
  propertyTest(
    "checks a property that holds",
    fc.property(fc.nat(), (n) => n >= 0),
  );
});
