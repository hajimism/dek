import { describe, expect, test } from "bun:test";
import { parsePort } from "../../src/cli/serve.ts";
import { DekError } from "../../src/core/error.ts";

describe("parsePort", () => {
  test("leaves the port to the OS when the flag is absent", () => {
    expect(parsePort(undefined)).toBeUndefined();
  });

  test("accepts a TCP port", () => {
    expect(parsePort("3030")).toBe(3030);
  });

  test.each(["0", "65536", "30x", "-1", ""])("rejects %p with a hint", (value) => {
    expect(() => parsePort(value)).toThrow(DekError);
    try {
      parsePort(value);
    } catch (error) {
      expect((error as DekError).hint).toBe("pass a port from 1 to 65535, e.g. `dek --port 3030`");
    }
  });
});
