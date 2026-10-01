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
    expect(() => parseCommandLine(["lint", "--fixx"])).toThrow("unknown flag --fixx for dekc lint");
  });

  test("rejects a flag another command takes, and says which flags this one has", () => {
    let error: unknown;
    try {
      parseCommandLine(["rehearse", "--port", "3030"]);
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(DekError);
    expect((error as DekError).message).toBe("unknown flag --port for dekc rehearse");
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
      values: { visual: true, port: 3030 },
    });
    expect(parseCommandLine(["talk", "--remote"])).toMatchObject({
      command: "talk",
      values: { remote: true },
    });
    // dek makes the password, so none is ever too short, empty, or left in shell history.
    expect(() => parseCommandLine(["--remote", "--password", "pw"])).toThrow(
      "unknown flag --password",
    );
    expect(() => parseCommandLine(["talk", "--fix"])).toThrow("unknown flag --fix for dekc talk");
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

describe("flag values", () => {
  const errorOf = (argv: string[]): DekError => {
    try {
      parseCommandLine(argv);
    } catch (error) {
      return error as DekError;
    }
    throw new Error("expected the command line to be refused");
  };

  test("hands a command its numbers as numbers", () => {
    expect(parseCommandLine(["--port", "3030"]).values.port).toBe(3030);
    expect(parseCommandLine(["video", "--fps", "29.97"]).values.fps).toBe(29.97);
    expect(
      parseCommandLine(["voice", "dict", "add", "dek", "デック", "--accent", "0"]).values.accent,
    ).toBe(0);
  });

  test.each([
    [["--port", "0"], "port"],
    [["--port", "65536"], "port"],
    [["--port", "30x"], "port"],
    [["--port=-1"], "port"],
    [["--port", ""], "port"],
    [["video", "--fps", ""], "fps"],
    [["video", "--fps", "0"], "fps"],
    [["video", "--fps", "fast"], "fps"],
    [["voice", "dict", "add", "dek", "デック", "--accent", "abc"], "accent"],
    [["voice", "dict", "add", "dek", "デック", "--accent", "1.5"], "accent"],
    [["lint", "--format", "json"], "format"],
  ])("refuses %p before any command runs", (argv, flag) => {
    const error = errorOf(argv);
    expect(error).toBeInstanceOf(DekError);
    const value = argv.at(-1)?.replace(/^--port=/, "");
    expect(error.message).toBe(`invalid --${flag} "${value}"`);
    expect(error.hint).toStartWith(`--${flag} takes `);
  });

  test("says what a value may be, with an example", () => {
    expect(errorOf(["--port", "0"]).hint).toBe(
      "--port takes a whole number from 1 to 65535, e.g. `dekc --port 3030`",
    );
    expect(errorOf(["video", "--fps", ""]).hint).toBe(
      "--fps takes a number above 0, e.g. `dekc video --fps 30`",
    );
    expect(errorOf(["lint", "--format", "json"]).hint).toBe(
      "--format takes sarif, e.g. `dekc lint --format sarif`; for JSON, pass --json",
    );
  });

  test("a subcommand takes only its own flags", () => {
    expect(errorOf(["voice", "say", "hello", "--accent", "1"]).message).toBe(
      "unknown flag --accent for dekc voice say",
    );
    expect(
      parseCommandLine(["voice", "demo", "dict", "add", "a", "b", "--accent", "1"]),
    ).toMatchObject({ command: "voice", subcommand: "dict add", values: { accent: 1 } });
  });

  test("the hint for a wrong flag points at the command's own help", () => {
    expect(errorOf(["lint", "--fixx"]).hint).toBe(
      "dekc lint takes --deck, --fix, --visual, --format, --json, --help, --version; run `dekc help lint`",
    );
    expect(errorOf(["voice", "say", "hi", "--accent", "1"]).hint).toBe(
      "dekc voice say takes --deck, --json, --help, --version; run `dekc help voice`",
    );
  });
});
