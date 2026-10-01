import { describe, expect, test } from "bun:test";
import { DekcError, errorFields } from "../../src/core/error.ts";

describe("errorFields", () => {
  test("keeps every field a DekcError carries", () => {
    const error = new DekcError("bad key", { path: "/p/dekc.toml", line: 3, hint: "remove it" });
    expect(errorFields(error)).toEqual({
      message: "bad key",
      path: "/p/dekc.toml",
      line: 3,
      hint: "remove it",
    });
  });

  test("leaves out the fields a DekcError does not set", () => {
    expect(errorFields(new DekcError("plain"))).toEqual({ message: "plain" });
  });

  test("reduces any other Error to its message", () => {
    expect(errorFields(new TypeError("boom"))).toEqual({ message: "boom" });
  });

  test("stringifies a thrown non-Error", () => {
    expect(errorFields("oops")).toEqual({ message: "oops" });
  });
});
