import { dirname } from "node:path";
import { type Diagnostic, errorDiagnostic } from "./diagnostic.ts";
import { resolveBinFromAncestors } from "./optional.ts";
import type { SarifLog } from "./sarif.ts";
import { OverrunError, runPiped, workerCommand } from "./spawn.ts";

/** Why lint has no findings from rumdl for a script: the `reason` when dek knows it, and `hung`. */
export type RumdlSkip = { reason?: string; hung?: true };

/** rumdl's SARIF for a script, or why there is none. */
export type RumdlRunner = (scriptPath: string) => Promise<string | RumdlSkip>;

/** rumdl checks a script in well under a second; a run this long is one that hangs. */
const RUMDL_TIMEOUT_MS = 30 * 1000;

export function resolveRumdlBin(): string | undefined {
  if (process.env.DEK_RUMDL) {
    return process.env.DEK_RUMDL;
  }
  // Beside dek's own install, as `bun add -d rumdl` puts it, never the working directory's: a
  // repository someone else wrote can commit a node_modules/.bin/rumdl for `dekc lint` to run.
  // The PATH as it is now: Bun.which alone searches the one the process started with.
  const onPath = Bun.which("rumdl", { PATH: process.env.PATH ?? "" });
  return onPath ?? resolveBinFromAncestors("rumdl", import.meta.dir);
}

/** Runs rumdl beside the script; one that cannot start says nothing, one that hangs is stopped. */
export async function defaultRumdlRunner(
  scriptPath: string,
  options: { timeoutMs?: number } = {},
): Promise<string | RumdlSkip> {
  const bin = resolveRumdlBin();
  if (!bin) {
    return {};
  }

  const timeoutMs = options.timeoutMs ?? RUMDL_TIMEOUT_MS;
  try {
    const args = ["check", scriptPath, "--output-format", "sarif"];
    // A rumdl that cannot start is skipped below, so its label and hint never reach the user.
    const { stdout, exitCode } = await runPiped(workerCommand(bin, args), {
      label: "rumdl failed",
      hint: "",
      cwd: dirname(scriptPath),
      // The environment as it is now, like the PATH rumdl was found on; left out, Bun passes
      // the one the process started with.
      env: process.env,
      timeoutMs,
    });
    if (exitCode === 2) {
      return {};
    }
    return stdout;
  } catch (error) {
    if (error instanceof OverrunError) {
      return {
        reason: `rumdl did not finish within ${timeoutMs / 1000}s and was stopped`,
        hung: true,
      };
    }
    return {};
  }
}

export async function rumdlDiagnostics(
  scriptPath: string,
  run: RumdlRunner = defaultRumdlRunner,
): Promise<Diagnostic[]> {
  return (await runRumdl(scriptPath, run)).diagnostics;
}

/**
 * rumdl's findings on the script, or why there are none (`skipped`): the deck is not what is
 * wrong, so lint goes on without them and says why.
 */
export async function runRumdl(
  scriptPath: string,
  run: RumdlRunner = defaultRumdlRunner,
): Promise<{ diagnostics: Diagnostic[]; sarif?: SarifLog; skipped?: RumdlSkip }> {
  const text = await run(scriptPath);
  if (typeof text !== "string") {
    return { diagnostics: [], skipped: text };
  }
  return parseRumdlSarif(text);
}

function parseRumdlSarif(text: string | null): {
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
      diagnostics.push(
        errorDiagnostic(result.ruleId, {
          message: result.message.text,
          ...(loc?.artifactLocation.uri ? { path: loc.artifactLocation.uri } : {}),
          ...(loc?.region?.startLine !== undefined ? { line: loc.region.startLine } : {}),
        }),
      );
    }
  }
  return { diagnostics, sarif };
}
