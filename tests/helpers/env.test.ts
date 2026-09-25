import { describe, expect, test } from "bun:test";
import { withEnv } from "./env.ts";

const KEY = "DEK_TEST_WITH_ENV";

describe("withEnv", () => {
  test("overlapping calls each see their own value and leave the original behind", async () => {
    delete process.env[KEY];
    let releaseFirst = () => {};
    const firstHeld = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const seen: Array<string | undefined> = [];
    const first = withEnv({ [KEY]: "first" }, async () => {
      await firstHeld;
      seen.push(process.env[KEY]);
    });
    const second = withEnv({ [KEY]: "second" }, async () => {
      seen.push(process.env[KEY]);
    });
    releaseFirst();
    await Promise.all([first, second]);
    expect(seen).toEqual(["first", "second"]);
    expect(process.env[KEY]).toBeUndefined();
  });

  test("a call inside another applies on top of it and restores it", async () => {
    const seen: Array<string | undefined> = [];
    await withEnv({ [KEY]: "outer" }, async () => {
      await withEnv({ [KEY]: "inner" }, async () => {
        seen.push(process.env[KEY]);
      });
      seen.push(process.env[KEY]);
    });
    expect(seen).toEqual(["inner", "outer"]);
    expect(process.env[KEY]).toBeUndefined();
  });

  test("restores the environment when the callback throws", async () => {
    await expect(
      withEnv({ [KEY]: "thrown" }, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(process.env[KEY]).toBeUndefined();
  });
});
