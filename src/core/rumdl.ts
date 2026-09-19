import { dirname } from "node:path";
import type { Diagnostic } from "./diagnostic.ts";
import { resolveBinFromAncestors } from "./optional.ts";
import type { SarifLog } from "./sarif.ts";
import { awaitPiped } from "./spawn.ts";

export type RumdlRunner = (scriptPath: string) => Promise<string | null>;

export function resolveRumdlBin(): string | undefined {
  if (process.env.DEK_RUMDL) {
    return process.env.DEK_RUMDL;
  }
  return Bun.which("rumdl") ?? resolveBinFromAncestors("rumdl", process.cwd());
}

export async function defaultRumdlRunner(scriptPath: string): Promise<string | null> {
  const bin = resolveRumdlBin();
  if (!bin) {
    return null;
  }

  try {
    const args = ["check", scriptPath, "--output-format", "sarif"];
    const cmd = bin.endsWith(".ts") ? ["bun", bin, ...args] : [bin, ...args];
    const proc = Bun.spawn(cmd, {
      cwd: dirname(scriptPath),
      stdout: "pipe",
      stderr: "pipe",
    });
    const { stdout, exitCode } = await awaitPiped(proc);
    if (exitCode === 2) {
      return null;
    }
    return stdout;
  } catch {
    return null;
  }
}

export async function rumdlDiagnostics(
  scriptPath: string,
  run: RumdlRunner = defaultRumdlRunner,
): Promise<Diagnostic[]> {
  return (await runRumdl(scriptPath, run)).diagnostics;
}

export async function runRumdl(
  scriptPath: string,
  run: RumdlRunner = defaultRumdlRunner,
): Promise<{ diagnostics: Diagnostic[]; sarif?: SarifLog; skipped?: boolean }> {
  const text = await run(scriptPath);
  if (text === null) {
    return { diagnostics: [], skipped: true };
  }
  return parseRumdlSarif(text);
}

export function parseRumdlSarif(text: string | null): {
  diagnostics: Diagnostic[];
  sarif?: SarifLog;
} {
  if (!text?.trim()) {
    return { diagnostics: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { diagnostics: [] };
  }

  if (!parsed || typeof parsed !== "object" || !("runs" in parsed) || !Array.isArray(parsed.runs)) {
    return { diagnostics: [] };
  }

  const sarif = parsed as SarifLog;
  const diagnostics: Diagnostic[] = [];
  for (const run of sarif.runs) {
    for (const result of run.results ?? []) {
      const loc = result.locations?.[0]?.physicalLocation;
      diagnostics.push({
        id: result.ruleId,
        message: result.message.text,
        ...(loc?.artifactLocation.uri ? { path: loc.artifactLocation.uri } : {}),
        ...(loc?.region?.startLine !== undefined ? { line: loc.region.startLine } : {}),
      });
    }
  }
  return { diagnostics, sarif };
}
