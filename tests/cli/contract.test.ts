import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { allSpecs, outputOf, type ResultCommand } from "../../src/cli/commands.ts";
import {
  CLI_SCHEMA_PATH,
  cliJsonSchema,
  contractIssues,
  FAILS_ON_FINDINGS,
  printedBy,
  RESULT_FIELDS,
} from "../../src/cli/contract.ts";
import { repoRoot } from "../helpers/paths.ts";

const diagnostic = {
  id: "DEK011",
  severity: "error",
  message: "slide contains an onclick attribute",
  path: "slides/intro.html",
  line: 6,
  column: 11,
  slug: "intro",
  hint: "remove it",
  data: { kind: "attribute", name: "onclick", nested: [1, { deep: true }] },
};

describe("the --json contract", () => {
  test("names the fields of every command that prints a result, and no other", () => {
    const results = allSpecs()
      .filter(([, spec]) => spec.kind === "result")
      .map(([name]) => name);
    expect(Object.keys(RESULT_FIELDS).sort()).toEqual(results.sort());
  });

  test("lets fail with findings exactly the commands that say how they fail", () => {
    const failing = (Object.keys(RESULT_FIELDS) as ResultCommand[]).filter(
      (command) => outputOf(command).failure !== undefined,
    );
    expect(failing.sort()).toEqual([...FAILS_ON_FINDINGS].sort());
  });

  test("takes a pass, a failure that carries its findings, and a command that could not run", () => {
    const lint = printedBy(["lint", "--json"]);
    expect(contractIssues(lint, { ok: true, diagnostics: [] })).toEqual([]);
    expect(
      contractIssues(lint, {
        ok: false,
        error: { message: "lint found 1 error", hint: "fix each error in diagnostics" },
        diagnostics: [diagnostic],
        skipped: [{ check: "visual", reason: "not measured", hint: "run `dekc lint --visual`" }],
      }),
    ).toEqual([]);
    expect(
      contractIssues(lint, {
        ok: false,
        error: { message: 'deck "nope" not found', path: "decks/nope", hint: "run `dekc ls`" },
      }),
    ).toEqual([]);
  });

  test("refuses a field the contract does not name, and one it requires that is missing", () => {
    const lint = printedBy(["lint", "--json"]);
    expect(contractIssues(lint, { ok: true, diagnostics: [], rumdlSarif: {} })).not.toEqual([]);
    expect(contractIssues(lint, { ok: true })).not.toEqual([]);
    expect(
      contractIssues(lint, { ok: true, diagnostics: [{ ...diagnostic, severity: "fatal" }] }),
    ).not.toEqual([]);
  });

  test("reads the command from the line as main does: a subcommand's, help's, or none", () => {
    const say = printedBy(["voice", "say", "こんにちは", "--json"]);
    expect(contractIssues(say, { ok: true, action: "say", text: "x", path: "/a.wav" })).toEqual([]);
    const help = printedBy(["help", "lint", "--json"]);
    expect(contractIssues(help, { ok: true, help: "dekc lint …" })).toEqual([]);
    expect(
      contractIssues(printedBy(["--version", "--json"]), { ok: true, version: "0.0.0" }),
    ).toEqual([]);
    // The dev server takes no --json, so all it can print is why.
    const serve = printedBy(["--json"]);
    expect(contractIssues(serve, { ok: false, error: { message: "prints no JSON" } })).toEqual([]);
    expect(contractIssues(serve, { ok: true })).not.toEqual([]);
  });

  test("is published as the JSON Schema the code states", async () => {
    const published = await readFile(join(repoRoot, CLI_SCHEMA_PATH), "utf8").catch(() => "");
    expect(published, "run `bun run schema` and commit the result").toBe(
      `${JSON.stringify(cliJsonSchema(), null, 2)}\n`,
    );
  });

  test("gives every command a schema of its own, sharing the diagnostic", () => {
    const schema = cliJsonSchema() as { $defs: Record<string, unknown> };
    for (const name of Object.keys(RESULT_FIELDS)) {
      expect(schema.$defs[name]).toBeDefined();
    }
    expect(schema.$defs.Diagnostic).toBeDefined();
    expect(JSON.stringify(schema.$defs.lint)).toContain('"#/$defs/Diagnostic"');
  });
});
