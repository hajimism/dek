import { describe, expect, test } from "bun:test";
import { createSerialTask } from "../../src/server/serial.ts";

describe("createSerialTask", () => {
  test("runs overlapping calls as one in-flight task plus one trailing run", async () => {
    let runs = 0;
    let inFlight = 0;
    let maxInFlight = 0;
    const task = createSerialTask(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      runs += 1;
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
    });

    task();
    task();
    task();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(maxInFlight).toBe(1);
    expect(runs).toBe(2);
  });

  test("runs the queued follow-up after a thrown task", async () => {
    let runs = 0;
    const task = createSerialTask(async () => {
      runs += 1;
      if (runs === 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        throw new Error("boom");
      }
    });

    task();
    task();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(runs).toBe(2);
  });
});
