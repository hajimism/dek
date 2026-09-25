import { describe, expect, test } from "bun:test";
import { parseCommandLine } from "../../src/cli/flags.ts";
import { DekError } from "../../src/core/error.ts";

describe("parseCommandLine", () => {
  test("names the command and keeps its flags and positionals", () => {
    expect(parseCommandLine(["lint", "beta", "--fix", "--json"])).toMatchObject({
      command: "lint",
      positionals: ["lint", "beta"],
      values: { fix: true, json: true },
    });
  });

  test("finds the command after a global flag", () => {
    expect(parseCommandLine(["--deck", "talk", "ls"])).toMatchObject({
      command: "ls",
      values: { deck: "talk" },
    });
  });

  test("rejects a flag dek does not have", () => {
    expect(() => parseCommandLine(["lint", "--fixx"])).toThrow(DekError);
    expect(() => parseCommandLine(["lint", "--fixx"])).toThrow("unknown flag --fixx for dek lint");
  });

  test("rejects a flag another command takes, and says which flags this one has", () => {
    let error: unknown;
    try {
      parseCommandLine(["rehearse", "--port", "3030"]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DekError);
    expect((error as DekError).message).toBe("unknown flag --port for dek rehearse");
    expect((error as DekError).hint).toContain("--remote");
  });

  test("rejects a value flag with nothing after it", () => {
    expect(() => parseCommandLine(["shot", "intro", "--to"])).toThrow("--to needs a value");
  });

  test("does not let a value flag swallow the next flag", () => {
    expect(() => parseCommandLine(["lint", "--deck", "--json"])).toThrow(
      "--deck needs a value, got --json",
    );
    expect(() => parseCommandLine(["shot", "intro", "--to", "--deck", "talk"])).toThrow(
      "--to needs a value, got --deck",
    );
  });

  test("rejects a value on a switch", () => {
    expect(() => parseCommandLine(["lint", "--fix=yes"])).toThrow("--fix takes no value");
  });

  test("the bare form and a deck name take the dev server's flags", () => {
    expect(parseCommandLine(["--visual", "--port", "3030"])).toMatchObject({
      command: undefined,
      values: { visual: true, port: "3030" },
    });
    expect(parseCommandLine(["talk", "--remote"])).toMatchObject({
      command: "talk",
      values: { remote: true },
    });
    // dek makes the password, so none is ever too short, empty, or left in shell history.
    expect(() => parseCommandLine(["--remote", "--password", "pw"])).toThrow(
      "unknown flag --password",
    );
    expect(() => parseCommandLine(["talk", "--fix"])).toThrow("unknown flag --fix for dek talk");
  });

  test("--help anywhere is help, so it takes --agent", () => {
    expect(parseCommandLine(["--help", "--agent"])).toMatchObject({
      values: { help: true, agent: true },
    });
    expect(parseCommandLine(["lint", "--help"])).toMatchObject({
      command: "lint",
      values: { help: true },
    });
    expect(parseCommandLine(["help", "--agent", "--json"])).toMatchObject({
      command: "help",
      values: { agent: true, json: true },
    });
  });

  test("--json is taken everywhere, since errors are printed as JSON too", () => {
    expect(parseCommandLine(["rehearse", "--json"])).toMatchObject({ values: { json: true } });
    expect(parseCommandLine(["ref", "add", "a/b/c", "--json"])).toMatchObject({
      command: "ref",
      positionals: ["ref", "add", "a/b/c"],
    });
  });
});
