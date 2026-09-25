import { describe, expect, test } from "bun:test";
import { createPairings } from "../../src/server/pairing.ts";

describe("createPairings", () => {
  test("lets a code in once", () => {
    const pairings = createPairings();
    const code = pairings.issue();
    expect(code).toMatch(/^[a-km-np-z2-9]{16}$/);
    expect(pairings.redeem(code)).toBe(true);
    expect(pairings.redeem(code)).toBe(false);
  });

  test("refuses a code it never issued", () => {
    expect(createPairings().redeem("abcdefghijkmnpqr")).toBe(false);
  });

  test("refuses a code once it expires, used or not", () => {
    let now = 0;
    const pairings = createPairings({ ttlMs: 1000, now: () => now });
    const code = pairings.issue();
    now = 1000;
    expect(pairings.redeem(code)).toBe(false);
  });

  test("keeps earlier codes good when a new one is issued", () => {
    const pairings = createPairings();
    const first = pairings.issue();
    const second = pairings.issue();
    expect(first).not.toBe(second);
    expect(pairings.redeem(first)).toBe(true);
    expect(pairings.redeem(second)).toBe(true);
  });
});
