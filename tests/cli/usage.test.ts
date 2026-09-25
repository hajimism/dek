import { describe, expect, test } from "bun:test";
import pkg from "../../package.json";
import { COMMAND_FLAGS, parseCommandLine } from "../../src/cli/flags.ts";
import {
  COMMAND_DOCS,
  commandHelp,
  FLAG_DOCS,
  helpRequest,
  unknownCommandError,
  versionText,
} from "../../src/cli/usage.ts";
import type { DekError } from "../../src/core/error.ts";
import { suggest } from "../../src/core/suggest.ts";
import { runDek } from "../helpers/cli.ts";

describe("command help", () => {
  test("documents every flag each command takes", () => {
    for (const [command, flags] of Object.entries(COMMAND_FLAGS)) {
      const help = commandHelp(command as keyof typeof COMMAND_FLAGS);
      for (const flag of flags) {
        expect(help).toContain(`--${flag}`);
        expect(FLAG_DOCS[flag].text.length).toBeGreaterThan(0);
      }
      expect(COMMAND_DOCS[command as keyof typeof COMMAND_DOCS].usage.length).toBeGreaterThan(0);
    }
  });

  test("shows a command's usage, what it does, and its flags", () => {
    expect(commandHelp("build")).toBe(`usage: dek build [deck] [--root-dist] [--url <url>]

Write the whole talk into one HTML file, dist/<deck>.html. Lint never stops a build;
the output says what lint found. Given the URL dist/ is served from, the first slide
also becomes dist/<deck>.png, the picture a shared link shows.

flags
  --deck NAME   target a deck by name from the project root
  --root-dist   write to <root>/dist/ instead of the deck's dist/
  --url <url>   the URL dist/ is served from, over url in dek.toml
  --json        print the result, or the error, as JSON
  --help, -h    show help; dek help <command> for one command

https://hajimism.github.io/dek/reference/cli.html`);
  });
});

describe("helpRequest", () => {
  const request = (argv: string[]) => helpRequest(parseCommandLine(argv));

  test("reads dek help <command> and dek <command> --help alike", () => {
    expect(request(["help", "build"])).toEqual({ kind: "help", topic: "build", agent: false });
    expect(request(["build", "--help"])).toEqual({ kind: "help", topic: "build", agent: false });
    expect(request(["lint", "-h"])).toEqual({ kind: "help", topic: "lint", agent: false });
    expect(request(["help", "serve"])).toEqual({ kind: "help", topic: "serve", agent: false });
  });

  test("gives the overview for dek help and dek --help", () => {
    expect(request(["help"])).toEqual({ kind: "help", agent: false });
    expect(request(["--help"])).toEqual({ kind: "help", agent: false });
    expect(request(["help", "--agent"])).toEqual({ kind: "help", agent: true });
  });

  test("rejects a help topic that is no command, as dek <word> does", () => {
    expect(() => request(["help", "biuld"])).toThrow("unknown command: biuld");
    try {
      request(["help", "biuld"]);
    } catch (error) {
      expect((error as DekError).hint).toBe("did you mean `dek build`?");
    }
  });

  test("reads --version and -v anywhere", () => {
    expect(request(["--version"])).toEqual({ kind: "version" });
    expect(request(["-v"])).toEqual({ kind: "version" });
    expect(request(["build"])).toBeUndefined();
  });

  test("prints the package version", () => {
    expect(versionText()).toBe(`dek ${pkg.version}`);
  });
});

describe("suggest", () => {
  test("finds the closest word within two edits", () => {
    expect(suggest("biuld", ["build", "lint", "ls"])).toBe("build");
    expect(suggest("lnit", ["build", "lint", "init"])).toBe("lint");
    expect(suggest("my-tlak", ["my-talk", "other"])).toBe("my-talk");
  });

  test("stays quiet when nothing is close", () => {
    expect(suggest("deploy", ["build", "lint", "ls"])).toBeUndefined();
  });
});

describe("unknownCommandError", () => {
  test("names the command or deck the user probably meant", () => {
    expect(unknownCommandError("biuld", []).hint).toBe("did you mean `dek build`?");
    expect(unknownCommandError("2026-04-vtie", ["2026-04-vite"]).hint).toBe(
      "did you mean `dek 2026-04-vite`?",
    );
  });

  test("points at help when nothing is close", () => {
    const error = unknownCommandError("deploy", []);
    expect(error.message).toBe("unknown command: deploy");
    expect(error.hint).toBe("run `dek help` to see the commands");
  });
});

describe("dek help <unknown>", () => {
  test("fails like dek <unknown> instead of printing the overview", async () => {
    const result = await runDek(["help", "bogus"]);
    expect(result).toMatchObject({ exitCode: 1 });
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unknown command: bogus");
  });
});
