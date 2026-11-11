import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import pkg from "../../package.json";
import { outputOf } from "../../src/cli/commands.ts";
import { type InstallRun, initCommand, initProject } from "../../src/cli/init.ts";
import { type LsDeckResult, lsCommand } from "../../src/cli/ls.ts";
import { resolveTarget } from "../../src/cli/scope.ts";
import { formatInit } from "../../src/cli/text.ts";
import { loadConfig } from "../../src/core/config.ts";
import { DekError } from "../../src/core/error.ts";
import { lintDeck } from "../../src/core/lint.ts";
import { PLAYWRIGHT_INSTALL } from "../../src/core/playwright.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";

type InitOk = {
  ok: true;
  root: string;
  created: string[];
  kept: string[];
};

describe("dekc init", () => {
  test("creates a project and returns JSON", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const result = await runDek(["init", target, "--no-install", "--json"], { cwd: dir });
      expect(result).toMatchObject({ exitCode: 0 });
      const json = jsonStdout<InitOk>(result);
      expect(json.ok).toBe(true);
      expect(json.root).toBe(target);
      expect(json.created).toContain("my-talks/dek.toml");
      expect(json.kept).toEqual([]);
    });
  });
});

describe("dekc init's dek.toml", () => {
  test("hands decks over under CC0-1.0 until the author says otherwise", async () => {
    await withTempDir(async (dir) => {
      initCommand({ cwd: dir, dir: "my-talks" });
      const toml = await readFile(join(dir, "my-talks", "dek.toml"), "utf8");
      expect(loadConfig(join(dir, "my-talks", "dek.toml")).pack).toEqual({ license: "CC0-1.0" });
      expect(toml).toContain("CC-BY-4.0");
    });
  });
});

describe("initCommand", () => {
  test("names next commands that run as printed, installing dek first when it is not local", async () => {
    await withTempDir(async (dir) => {
      expect(initCommand({ cwd: dir, dir: "my-talks", deck: "demo" }).next).toEqual([
        "cd my-talks",
        "bun add -d @hajimism/dek",
        "cd decks/demo",
        "$EDITOR script.md",
        "bunx dekc",
      ]);
      expect(initCommand({ cwd: dir, dir: "bare" }).next).toEqual([
        "cd bare",
        "bun add -d @hajimism/dek",
        "bunx dekc new <name>",
      ]);
      expect(initCommand({ cwd: join(dir, "bare") }).next).toEqual([
        "bun add -d @hajimism/dek",
        "bunx dekc new <name>",
      ]);
    });
  });

  test("skips the install step when the project already has dek in node_modules", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
      await writeFile(join(dir, "node_modules", ".bin", "dekc"), "");
      expect(initCommand({ cwd: dir, dir: "my-talks", deck: "demo" }).next).toEqual([
        "cd my-talks/decks/demo",
        "$EDITOR script.md",
        "bunx dekc",
      ]);
    });
  });

  test("names the Playwright install until the project has it", async () => {
    await withTempDir(async (dir) => {
      expect(initCommand({ cwd: dir, dir: "my-talks" }).playwright).toBe(PLAYWRIGHT_INSTALL);
      await mkdir(join(dir, "my-talks", "node_modules", "playwright"), { recursive: true });
      await writeFile(join(dir, "my-talks", "node_modules", "playwright", "package.json"), "{}");
      expect(initCommand({ cwd: dir, dir: "my-talks" }).playwright).toBeUndefined();
    });
  });

  test("quotes a path with spaces for the shell", async () => {
    await withTempDir(async (dir) => {
      expect(initCommand({ cwd: dir, dir: "My Talks", deck: "it's" }).next).toEqual([
        "cd 'My Talks'",
        "bun add -d @hajimism/dek",
        "cd 'decks/it'\\''s'",
        "$EDITOR script.md",
        "bunx dekc",
      ]);
    });
  });

  test("changes into the absolute path when that is shorter than the relative one", async () => {
    await withTempDir(async (dir) => {
      const deep = join(dir, ...Array.from({ length: 40 }, () => "a"));
      expect(initCommand({ cwd: deep, dir: join(dir, "talks") }).next[0]).toBe(
        `cd ${join(dir, "talks")}`,
      );
    });
  });

  test("checks every input before it writes anything", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "newproj");
      expect(() => initCommand({ cwd: dir, dir: target, deck: "bad/name" })).toThrow(
        "invalid deck name",
      );
      expect(() => initCommand({ cwd: dir, dir: target, deck: "talk\u{E0041}" })).toThrow(
        "invalid deck name",
      );
      expect(existsSync(target)).toBe(false);
    });
  });

  test("checks the files dek refreshes, too, before it writes anything", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "newproj");
      await mkdir(join(target, "AGENTS.md"), { recursive: true });
      try {
        initCommand({ cwd: dir, dir: target, deck: "demo" });
        throw new Error("expected init to refuse");
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toBe("a directory is in the way of a file");
        expect((error as DekError).path).toBe(join(target, "AGENTS.md"));
      }
      expect(existsSync(join(target, "dek.toml"))).toBe(false);
    });
  });

  test("refuses to nest a project inside another, pointing at dekc new", async () => {
    await withTempDir(async (dir) => {
      initCommand({ cwd: dir, deck: "talk" });
      const inner = join(dir, "decks", "talk2");
      try {
        initCommand({ cwd: inner });
        throw new Error("expected init to refuse");
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("inside the dek project");
        expect((error as DekError).hint).toContain("dekc new talk2");
      }
      expect(existsSync(inner)).toBe(false);
    });
  });

  // Init never overwrites a file, so a theme.css it finds is kept, and the first deck copies it.
  // One that is no dekc theme would fail that deck's lint on its first run: init says so first.
  test("says when the theme.css it kept lacks the tokens every deck needs", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "theme.css"), "body { margin: 0; }\n");
      const result = initCommand({ cwd: dir, deck: "demo" });
      expect(result.kept).toContain(join(dir, "theme.css"));
      expect(result.missingTokens).toHaveLength(13);
      expect(result.missingTokens?.[0]).toBe("--fg");
      expect(outputOf("init").notes?.(result, false)).toBe(
        `${join(dir, "theme.css")} was kept and lacks 13 tokens every deck needs (--fg, --bg, --accent, …)\n  help: add them to its .slide rule, or move it aside and run \`dekc init\` again for dek's own theme`,
      );
    });
  });

  test("keeps every file that exists, and says so, when run again", async () => {
    await withTempDir(async (dir) => {
      const first = initCommand({ cwd: dir, deck: "demo" });
      expect(first.kept).toEqual([]);
      await writeFile(join(dir, "AGENTS.md"), "# my own notes\n");
      await writeFile(join(dir, "decks", "demo", "script.md"), "## mine\n");

      const again = initCommand({ cwd: dir, deck: "demo" });
      // AGENTS.md is shared: the author's notes stay, and dek's block follows them.
      const agents = await readFile(join(dir, "AGENTS.md"), "utf8");
      expect(agents.startsWith("# my own notes\n\n<!-- dek:begin")).toBe(true);
      expect(agents).toContain("dekc help --agent");
      expect(await readFile(join(dir, "decks", "demo", "script.md"), "utf8")).toBe("## mine\n");
      expect(again.created).toEqual([]);
      expect(again.updated).toEqual([join(dir, "AGENTS.md")]);
      expect(again.kept).toEqual([join(dir, "decks", "demo", "script.md")]);
      expect(formatInit(again)).toContain(`  ${join(dir, "AGENTS.md")} (updated)\n`);
    });
  });

  test("creates a first deck that already passes lint", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const result = initCommand({ cwd: dir, dir: target, deck: "demo" });
      expect(result.created).toContain(join(target, "decks", "demo", "slides", "intro.html"));
      expect(lintDeck(join(target, "decks", "demo"))).toEqual([]);
    });
  });

  test("starts the first deck with a real script: sections, beats, a budget, an estimate", async () => {
    await withTempDir(async (dir) => {
      initCommand({ cwd: dir, deck: "demo" });
      const ls = lsCommand(resolveTarget(dir, "decks", { deck: "demo" })) as LsDeckResult;
      expect(ls.duration).toBeDefined();
      expect(ls.estimateSeconds).toBeGreaterThan(0);
      expect(ls.sections.length).toBeGreaterThan(1);
      expect(ls.sections.some((section) => section.beats > 0)).toBe(true);
      expect(ls.diagnostics).toEqual([]);
    });
  });

  test("writes AGENTS.md with or without a first deck", async () => {
    await withTempDir(async (dir) => {
      for (const [name, deck] of [
        ["bare", undefined],
        ["with-deck", "demo"],
      ] as const) {
        const target = join(dir, name);
        const result = initCommand({ cwd: dir, dir: target, ...(deck ? { deck } : {}) });
        expect(result.created).toContain(join(target, "AGENTS.md"));
        expect(await readFile(join(target, "AGENTS.md"), "utf8")).toContain("dekc help --agent");
      }
    });
  });

  test("creates a project with a first deck", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const result = initCommand({ cwd: dir, dir: target, deck: "demo" });
      expect(result.root).toBe(target);

      expect(existsSync(join(target, "dek.toml"))).toBe(true);
      expect(existsSync(join(target, "theme.css"))).toBe(true);
      expect(existsSync(join(target, "assets"))).toBe(true);
      expect(existsSync(join(target, "decks"))).toBe(true);
      expect(existsSync(join(target, "decks", "demo", "script.md"))).toBe(true);
      expect(existsSync(join(target, "decks", "demo", "theme.css"))).toBe(true);
      expect(existsSync(join(target, "decks", "demo", "slides"))).toBe(true);
      expect(existsSync(join(target, "decks", "demo", "assets"))).toBe(true);
      expect(existsSync(join(target, ".dek", "schema.json"))).toBe(true);
      expect(existsSync(join(target, ".rumdl.toml"))).toBe(true);
      const rumdl = await readFile(join(target, ".rumdl.toml"), "utf8");
      expect(rumdl).toContain("MD041");
      expect(rumdl).not.toContain("MD013");

      const theme = await readFile(join(target, "theme.css"), "utf8");
      expect(theme).toContain(".slide");
    });
  });

  test("creates .gitignore that ignores dist, .cache, and the dev-server lock", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const result = initCommand({ cwd: dir, dir: target });
      expect(result.created).toContain(join(target, ".gitignore"));
      const gitignore = await readFile(join(target, ".gitignore"), "utf8");
      expect(gitignore).toContain("dist/");
      expect(gitignore).toContain(".cache/");
      expect(gitignore).toContain(".dek/server.json");
      expect(gitignore).toContain("node_modules/");
      expect(gitignore).not.toContain("schema.json");
    });
  });

  test("does not overwrite an existing .gitignore", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      await mkdir(target, { recursive: true });
      await writeFile(join(target, ".gitignore"), "# mine\n");
      const result = initCommand({ cwd: dir, dir: target });
      expect(await readFile(join(target, ".gitignore"), "utf8")).toBe("# mine\n");
      expect(result.created).not.toContain(join(target, ".gitignore"));
    });
  });

  test("rejects a deck name with path separators", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      expect(() => initCommand({ cwd: dir, dir: target, deck: "../evil" })).toThrow(DekError);
      try {
        initCommand({ cwd: dir, dir: target, deck: "../evil" });
      } catch (error) {
        expect(error).toBeInstanceOf(DekError);
        expect((error as DekError).message).toContain("invalid deck name");
      }
      expect(existsSync(join(dir, "evil"))).toBe(false);
    });
  });

  test("always creates decks/ even without --deck", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      initCommand({ cwd: dir, dir: target });
      expect(existsSync(join(target, "decks"))).toBe(true);
      expect(existsSync(join(target, "dek.toml"))).toBe(true);
    });
  });

  test("does not overwrite an existing theme.css", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      await mkdir(target, { recursive: true });
      await writeFile(join(target, "theme.css"), "/* custom */\n");
      initCommand({ cwd: dir, dir: target });
      expect(await readFile(join(target, "theme.css"), "utf8")).toBe("/* custom */\n");
    });
  });

  test("uses cwd when dir is omitted", async () => {
    await withTempDir(async (dir) => {
      const result = initCommand({ cwd: dir });
      expect(result.root).toBe(dir);
      expect(existsSync(join(dir, "dek.toml"))).toBe(true);
    });
  });

  test.skipIf(!Bun.which("rumdl"))(
    "init script.md is clean under the shipped rumdl config",
    async () => {
      await withTempDir(async (dir) => {
        const target = join(dir, "my-talks");
        initCommand({ cwd: dir, dir: target, deck: "demo" });
        const proc = Bun.spawn(
          ["rumdl", "check", join(target, "decks", "demo", "script.md"), "--output-format", "json"],
          { cwd: target, stdout: "pipe", stderr: "pipe" },
        );
        const [stdout, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          proc.exited,
        ]);
        expect(exitCode).toBe(0);
        expect(stdout.trim() === "" || stdout.trim() === "[]").toBe(true);
      });
    },
  );
});

/** An install that records what it was asked to run, and lays down what a real one would leave. */
function fakeInstall(options: { fail?: string; throws?: string } = {}): {
  run: InstallRun;
  ran: { argv: string[]; cwd: string }[];
} {
  const ran: { argv: string[]; cwd: string }[] = [];
  const run: InstallRun = async (argv, cwd) => {
    ran.push({ argv, cwd });
    if (options.throws) {
      throw new DekError(options.throws);
    }
    if (options.fail) {
      return { exitCode: 1, stderr: `error: ${options.fail}\n` };
    }
    const added = argv[1] === "add" ? argv.at(-1) : undefined;
    if (added?.startsWith("@hajimism/dek@")) {
      await mkdir(join(cwd, "node_modules", ".bin"), { recursive: true });
      await writeFile(join(cwd, "node_modules", ".bin", "dekc"), "");
    }
    if (added === "playwright") {
      await mkdir(join(cwd, "node_modules", "playwright"), { recursive: true });
      await writeFile(join(cwd, "node_modules", "playwright", "package.json"), "{}");
    }
    return { exitCode: 0, stderr: "" };
  };
  return { run, ran };
}

describe("initProject", () => {
  test("installs the dek that is running into the project, so next is only the talk", async () => {
    await withTempDir(async (dir) => {
      const { run, ran } = fakeInstall();
      const result = await initProject({ cwd: dir, dir: "my-talks", deck: "demo", run });
      const root = join(dir, "my-talks");
      expect(ran).toEqual([
        { argv: [process.execPath, "add", "--dev", `@hajimism/dek@${pkg.version}`], cwd: root },
      ]);
      expect(result.installed).toEqual([`bun add -d @hajimism/dek@${pkg.version}`]);
      expect(result.next).toEqual(["cd my-talks/decks/demo", "$EDITOR script.md", "bunx dekc"]);
      expect(result.notInstalled).toBeUndefined();
      expect(result.playwright).toBe(PLAYWRIGHT_INSTALL);
    });
  });

  // bun adds to the nearest package.json above it: without one of its own, a project made
  // inside another repository would put dek in that repository's.
  test("gives the project a package.json of its own for the install to land in", async () => {
    await withTempDir(async (dir) => {
      await writeFile(join(dir, "package.json"), '{ "name": "outer" }\n');
      const result = await initProject({ cwd: dir, dir: "my-talks", run: fakeInstall().run });
      expect(result.created).toContain(join(dir, "my-talks", "package.json"));
      expect(JSON.parse(await readFile(join(dir, "my-talks", "package.json"), "utf8"))).toEqual({
        private: true,
      });
      expect(await readFile(join(dir, "package.json"), "utf8")).toBe('{ "name": "outer" }\n');
      // Once installs have written to it, it is the project's: run again, init does not list it.
      await writeFile(join(dir, "my-talks", "package.json"), '{ "devDependencies": {} }\n');
      const again = await initProject({ cwd: dir, dir: "my-talks", run: fakeInstall().run });
      expect(again.kept).toEqual([]);
    });
  });

  test("leaves the install to the author with install: false", async () => {
    await withTempDir(async (dir) => {
      const { run, ran } = fakeInstall();
      const result = await initProject({ cwd: dir, dir: "my-talks", install: false, run });
      expect(ran).toEqual([]);
      expect(result.installed).toBeUndefined();
      expect(result.next).toEqual([
        "cd my-talks",
        "bun add -d @hajimism/dek",
        "bunx dekc new <name>",
      ]);
    });
  });

  test("installs nothing when the project already has dek", async () => {
    await withTempDir(async (dir) => {
      await mkdir(join(dir, "node_modules", ".bin"), { recursive: true });
      await writeFile(join(dir, "node_modules", ".bin", "dekc"), "");
      const { run, ran } = fakeInstall();
      const result = await initProject({ cwd: dir, dir: "my-talks", deck: "demo", run });
      expect(ran).toEqual([]);
      expect(result.installed).toBeUndefined();
    });
  });

  test("keeps the project when the install fails, and says what to run instead", async () => {
    await withTempDir(async (dir) => {
      for (const install of [
        fakeInstall({ fail: "GET https://registry.npmjs.org - 503" }),
        fakeInstall({ throws: "bun add timed out" }),
      ]) {
        const result = await initProject({
          cwd: dir,
          dir: "my-talks",
          deck: "demo",
          run: install.run,
        });
        expect(existsSync(join(dir, "my-talks", "decks", "demo", "script.md"))).toBe(true);
        expect(result.installed).toBeUndefined();
        expect(result.notInstalled).toEqual([
          {
            install: "dek",
            reason: expect.stringContaining(`bun add -d @hajimism/dek@${pkg.version} failed`),
          },
        ]);
        expect(result.next).toContain("bun add -d @hajimism/dek");
      }
      const failed = await initProject({
        cwd: dir,
        dir: "other",
        run: fakeInstall({ fail: "GET https://registry.npmjs.org - 503" }).run,
      });
      expect(failed.notInstalled?.[0]?.reason).toContain("GET https://registry.npmjs.org - 503");
    });
  });

  test("installs Playwright and Chromium with browser: true, after dek", async () => {
    await withTempDir(async (dir) => {
      const { run, ran } = fakeInstall();
      const result = await initProject({ cwd: dir, dir: "my-talks", browser: true, run });
      const root = join(dir, "my-talks");
      expect(ran.map((step) => step.argv.slice(1))).toEqual([
        ["add", "--dev", `@hajimism/dek@${pkg.version}`],
        ["add", "--dev", "playwright"],
        ["x", "--bun", "playwright", "install", "chromium"],
      ]);
      expect(ran.every((step) => step.cwd === root)).toBe(true);
      expect(result.installed).toEqual([
        `bun add -d @hajimism/dek@${pkg.version}`,
        "bun add -d playwright",
        "bunx --bun playwright install chromium",
      ]);
      expect(result.playwright).toBeUndefined();
    });
  });

  test("skips the browser when the dek install failed, since dek finds Playwright beside itself", async () => {
    await withTempDir(async (dir) => {
      const { run, ran } = fakeInstall({ fail: "offline" });
      const result = await initProject({ cwd: dir, dir: "my-talks", browser: true, run });
      expect(ran).toHaveLength(1);
      expect(result.notInstalled?.map((entry) => entry.install)).toEqual(["dek", "browser"]);
      expect(outputOf("init").notes?.(result, false)).toBe(
        `dek: not installed (bun add -d @hajimism/dek@${pkg.version} failed: error: offline)\nbrowser: not installed (dek is not installed in the project)`,
      );
      expect(result.playwright).toBe(PLAYWRIGHT_INSTALL);
    });
  });

  test("refuses browser: true with install: false before it writes anything", async () => {
    await withTempDir(async (dir) => {
      const target = join(dir, "my-talks");
      const attempt = initProject({
        cwd: dir,
        dir: target,
        install: false,
        browser: true,
        run: fakeInstall().run,
      });
      await expect(attempt).rejects.toThrow("--browser needs dek installed in the project");
      expect(existsSync(target)).toBe(false);
    });
  });
});
