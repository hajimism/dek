import { describe, expect, test } from "bun:test";
import { DekError, errorFields } from "../../src/core/error.ts";

describe("errorFields", () => {
  test("keeps every field a DekError carries", () => {
    const error = new DekError("bad key", { path: "/p/dek.toml", line: 3, hint: "remove it" });
    expect(errorFields(error)).toEqual({
      message: "bad key",
      path: "/p/dek.toml",
      line: 3,
      hint: "remove it",
    });
  });

  test("leaves out the fields a DekError does not set", () => {
    expect(errorFields(new DekError("plain"))).toEqual({ message: "plain" });
  });

  test("reduces any other Error to its message", () => {
    expect(errorFields(new TypeError("boom"))).toEqual({ message: "boom" });
  });

  test("stringifies a thrown non-Error", () => {
    expect(errorFields("oops")).toEqual({ message: "oops" });
  });
});
