import { describe, expect, test } from "bun:test";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withTempDir } from "../helpers/fs.ts";

describe("dek help", () => {
  test("prints the same help for help and --help", async () => {
    const help = await runDek(["help"]);
    const flag = await runDek(["--help"]);
    expect(help.exitCode).toBe(0);
    expect(flag.exitCode).toBe(0);
    expect(help.stdout).toBe(flag.stdout);
    expect(help.stdout).toContain("init");
    expect(help.stdout).toContain("lint");
    expect(help.stdout).toContain("build");
    expect(help.stdout).toContain("mv");
    expect(help.stdout).toContain("pdf");
    expect(help.stdout).toContain("cues");
    expect(help.stdout).toContain("--remote");
    expect(help.stdout).toContain("rehearse");
    expect(help.stdout).toContain("video");
    expect(help.stdout).toContain("voice pin");
    expect(help.stdout).toContain("--json");
    expect(help.stdout).toContain("Dev");
    expect(help.stdout).toContain("Project");
    expect(help.stdout).toContain("Slide");
    expect(help.stdout).toContain("CI");
    expect(help.stdout).toContain("dek help --agent");
    expect(help.stdout).toContain(
      "Commands that print a result accept --json. dek and dek rehearse stay running.",
    );
    expect(help.stdout).not.toContain("All commands accept --json");
  });

  test("prints a compact agent reference for --agent", async () => {
    const result = await runDek(["help", "--agent"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("check");
    expect(result.stdout).toContain("shot");
    expect(result.stdout).toContain("goto");
    expect(result.stdout).toContain("current");
    expect(result.stdout).toContain("--visual");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("sarif");
    expect(result.stdout).toContain("pdf");
    expect(result.stdout).toContain("--remote");
    expect(result.stdout).toContain("pin");
    expect(result.stdout).toContain(
      "Result commands accept --json. dek / rehearse do not (long-running).",
    );
    expect(result.stdout).not.toContain("All commands accept --json");
    expect(result.stdout.split("\n").length).toBeLessThan(80);
    const human = await runDek(["help"]);
    expect(result.stdout).not.toBe(human.stdout);
  });

  test("returns agent help as JSON with --agent --json", async () => {
    const result = await runDek(["help", "--agent", "--json"]);
    expect(result.exitCode).toBe(0);
    const json = jsonStdout<{ ok: true; help: string }>(result);
    expect(json.ok).toBe(true);
    expect(json.help).toContain("check");
    expect(json.help).toContain("--json");
    expect(json.help).toContain("dek / rehearse do not (long-running)");
  });

  test("prints help for an unknown command", async () => {
    const result = await runDek(["nope"]);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("error:");
    expect(result.stderr).toContain("help:");
    expect(`${result.stdout}${result.stderr}`).toContain("init");
    expect(`${result.stdout}${result.stderr}`).toContain("unknown command");
  });

  test("does not crash on an unknown flag", async () => {
    const result = await runDek(["--help", "--unknown-flag"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("init");
  });
});

describe("dek json errors", () => {
  test("returns a structured error outside a project", async () => {
    await withTempDir(async (dir) => {
      const result = await runDek(["ls", "--json"], { cwd: dir });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<{
        ok: false;
        error: { message: string; path?: string; hint?: string };
      }>(result);
      expect(json.ok).toBe(false);
      expect(json.error.message).toContain("not a dek project");
      expect(json.error.path).toBe(dir);
      expect(json.error.hint).toContain("dek init");
    });
  });
});
