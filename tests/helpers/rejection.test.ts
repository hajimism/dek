import { describe, expect, test } from "bun:test";
import { rejectionOf } from "./rejection.ts";

const rejectAfter = (ms: number, reason: unknown) =>
  Bun.sleep(ms).then(() => {
    throw reason;
  });

describe("rejectionOf", () => {
  test("gives what the promise rejects with", async () => {
    const reason = new Error("boom");
    expect(await rejectionOf(rejectAfter(1, reason))).toBe(reason);
  });

  test("fails when the promise resolves", async () => {
    const error = await rejectionOf(rejectionOf(Promise.resolve("value")));
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("resolved");
  });

  test("lets a quick rejection through while a slow one is still pending", async () => {
    const started = Date.now();
    const slow = rejectionOf(rejectAfter(300, "slow"));
    const quickAt = rejectionOf(rejectAfter(1, "quick")).then(() => Date.now() - started);
    expect(await quickAt).toBeLessThan(300);
    expect(await slow).toBe("slow");
  });
});
