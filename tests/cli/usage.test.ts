import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pkg from "../../package.json";
import {
  allSpecs,
  commandFlags,
  type Group,
  subcommandsOf,
  usageLines,
} from "../../src/cli/commands.ts";
import { FLAGS, parseCommandLine } from "../../src/cli/flags.ts";
import { commandHelp, helpRequest, unknownCommandError, versionText } from "../../src/cli/usage.ts";
import type { DekcError } from "../../src/core/error.ts";
import { suggest } from "../../src/core/suggest.ts";
import { runDekc } from "../helpers/cli.ts";

describe("command help", () => {
  test("documents every flag each command takes", () => {
    for (const [command] of allSpecs()) {
      const help = commandHelp(command);
      for (const flag of commandFlags(command)) {
        expect(help).toContain(`--${flag}`);
        expect(FLAGS[flag].text.length).toBeGreaterThan(0);
      }
      expect(usageLines(command).length).toBeGreaterThan(0);
    }
  });

  test("the overviews name every flag of every command, so they cannot drift from it", () => {
    for (const [name, spec] of allSpecs()) {
      const overview = spec.overview.map(([call, text]) => `${call} ${text}`).join("\n");
      const agent = spec.agent.join("\n");
      // --deck is said once for all; `dekc help --agent` is in the footer of dekc help.
      for (const flag of commandFlags(name).filter((flag) => flag !== "deck" && flag !== "agent")) {
        expect({ name, flag, found: overview.includes(`--${flag}`) }).toEqual({
          name,
          flag,
          found: true,
        });
        expect({ name, flag, found: agent.includes(`--${flag}`) }).toEqual({
          name,
          flag,
          found: true,
        });
      }
    }
  });

  test("each usage names the words its form requires, as the errors name them", () => {
    for (const [name, spec] of allSpecs()) {
      for (const form of [spec, ...Object.values(subcommandsOf(spec))]) {
        const usage = form.usage.join("\n");
        for (const arg of form.args.filter((arg) => !arg.endsWith("?"))) {
          const key = arg.replace(/\.\.\.$/, "");
          expect({ name, arg, found: usage.includes(`<${key}>`) }).toEqual({
            name,
            arg,
            found: true,
          });
        }
      }
    }
  });

  test("shows a command's usage, what it does, and its flags", () => {
    expect(
      commandHelp("build"),
    ).toBe(`usage: dekc build [deck] [--root-dist] [--url <url>] [--public]

Write the whole talk into one HTML file, dist/<deck>.html. Lint never stops a build;
the output says what lint found. Given the URL dist/ is served from, the first slide
also becomes dist/<deck>.png, the picture a shared link shows.

flags
  --deck NAME   target a deck by name from the project root
  --root-dist   write to <root>/dist/ instead of the deck's dist/
  --url <url>   the URL dist/ is served from, over url in dekc.toml
  --public      a page for anyone with the link, without the script's stage directions and comments
  --json        print the result, or the error, as JSON
  --help, -h    show help; dekc help <command> for one command

https://hajimism.github.io/dekc/reference/cli.html`);
  });
});

describe("helpRequest", () => {
  const request = (argv: string[]) => helpRequest(parseCommandLine(argv));

  test("reads dekc help <command> and dekc <command> --help alike", () => {
    expect(request(["help", "build"])).toEqual({ kind: "help", topic: "build", agent: false });
    expect(request(["build", "--help"])).toEqual({ kind: "help", topic: "build", agent: false });
    expect(request(["lint", "-h"])).toEqual({ kind: "help", topic: "lint", agent: false });
    expect(request(["help", "serve"])).toEqual({ kind: "help", topic: "serve", agent: false });
  });

  test("gives the overview for dekc help and dekc --help", () => {
    expect(request(["help"])).toEqual({ kind: "help", agent: false });
    expect(request(["--help"])).toEqual({ kind: "help", agent: false });
    expect(request(["help", "--agent"])).toEqual({ kind: "help", agent: true });
  });

  test("rejects a help topic that is no command, as dekc <word> does", () => {
    expect(() => request(["help", "biuld"])).toThrow("unknown command: biuld");
    try {
      request(["help", "biuld"]);
    } catch (error) {
      expect((error as DekcError).hint).toBe("did you mean `dekc build`?");
    }
  });

  test("reads --version and -v anywhere", () => {
    expect(request(["--version"])).toEqual({ kind: "version" });
    expect(request(["-v"])).toEqual({ kind: "version" });
    expect(request(["build"])).toBeUndefined();
  });

  test("prints the package version", () => {
    expect(versionText()).toBe(`dekc ${pkg.version}`);
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
    expect(unknownCommandError("biuld", []).hint).toBe("did you mean `dekc build`?");
    expect(unknownCommandError("2026-04-vtie", ["2026-04-vite"]).hint).toBe(
      "did you mean `dekc 2026-04-vite`?",
    );
  });

  test("points at help when nothing is close", () => {
    const error = unknownCommandError("deploy", []);
    expect(error.message).toBe("unknown command: deploy");
    expect(error.hint).toBe("run `dekc help` to see the commands");
  });
});

describe("dekc help <unknown>", () => {
  test("fails like dekc <unknown> instead of printing the overview", async () => {
    const result = await runDekc(["help", "bogus"]);
    expect(result).toMatchObject({ exitCode: 1 });
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("unknown command: bogus");
  });
});

describe("the CLI reference", () => {
  const root = join(import.meta.dir, "..", "..");
  const HEADINGS: Record<string, Record<Group, string>> = {
    "docs/reference/cli.md": {
      Development: "Development",
      Project: "Project",
      Refs: "Refs",
      Slide: "Slide",
      Output: "Output",
      Help: "Help",
    },
    "docs/ja/reference/cli.md": {
      Development: "開発",
      Project: "プロジェクト",
      Refs: "ref",
      Slide: "スライド",
      Output: "成果物",
      Help: "ヘルプ",
    },
  };

  /** Each `## ` section's calls: the code spans in the first cell of its table rows. */
  function calls(path: string): Map<string, string[]> {
    const sections = new Map<string, string[]>();
    let heading = "";
    for (const line of readFileSync(join(root, path), "utf8").split("\n")) {
      if (line.startsWith("## ")) {
        heading = line.slice(3);
        sections.set(heading, []);
        continue;
      }
      const cell = line.match(/^\| ((?:[^|\\]|\\\|)+) \|/)?.[1];
      if (cell) {
        const spans = [...cell.matchAll(/`([^`]+)`/g)].map((m) =>
          (m[1] ?? "").replace(/\\\|/g, "|"),
        );
        sections.get(heading)?.push(...spans);
      }
    }
    return sections;
  }

  for (const [path, headings] of Object.entries(HEADINGS)) {
    test(`lists every usage line under its group in ${path}`, () => {
      const sections = calls(path);
      const missing = allSpecs().flatMap(([name, spec]) =>
        usageLines(name)
          .filter((usage) => !sections.get(headings[spec.group])?.includes(usage))
          .map((usage) => `${headings[spec.group]}: ${usage}`),
      );
      expect(missing).toEqual([]);
    });

    test(`lists every command that reads a ref under refs in ${path}`, () => {
      const refs = sections(path, headings.Refs);
      const readers = allSpecs().filter(([, spec]) => spec.refs === true);
      expect(readers.length).toBeGreaterThan(0);
      for (const [name] of readers) {
        expect({ name, found: refs.some((call) => call.startsWith(`dekc ${name} <ref>`)) }).toEqual(
          {
            name,
            found: true,
          },
        );
      }
    });
  }

  function sections(path: string, heading: string): string[] {
    return calls(path).get(heading) ?? [];
  }
});
