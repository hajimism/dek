import { describe, expect, test } from "bun:test";
import { helpText } from "../../src/cli/format.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";

describe("dek help", () => {
  test("prints the human help text", async () => {
    const result = await runDek(["help"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${helpText()}\n`);
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
});
