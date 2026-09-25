import { existsSync } from "node:fs";
import { relative } from "node:path";
import { type Diagnostic, uniqueDiagnostics } from "../core/diagnostic.ts";
import { lintDeck, syncDeck } from "../core/index.ts";
import { playwrightMissingError } from "../core/playwright.ts";
import { resolveRumdlBin, runRumdl } from "../core/rumdl.ts";
import { mergeSarif, type SarifLog } from "../core/sarif.ts";
import { lintVisualDeck } from "../core/visual.ts";
import { type SkippedCheck, skippedChecks } from "./result.ts";
import { resolveDecks } from "./scope.ts";

export type LintCliResult = {
  diagnostics: Diagnostic[];
  /** Checks that did not run, each with why and how to run it, so an empty list is not a pass. */
  skipped?: SkippedCheck[];
  rumdlSarif?: SarifLog;
};

export async function lintCommand(options: {
  cwd: string;
  deck?: string;
  fix?: boolean;
  visual?: boolean;
}): Promise<LintCliResult> {
  const { project, decks } = resolveDecks(options.cwd, { deck: options.deck });
  const diagnostics: Diagnostic[] = [];
  let rumdlSkip: SkippedCheck | undefined;
  let rumdlSarif: SarifLog | undefined;

  for (const deck of decks) {
    if (options.fix) {
      syncDeck({ project, deck });
    }
    diagnostics.push(...lintDeck({ project, deck }));
    const markdown = await runRumdl(deck.scriptPath);
    diagnostics.push(...markdown.diagnostics);
    if (markdown.skipped) {
      rumdlSkip ??= rumdlSkipped(deck.scriptPath, options.cwd);
    }
    if (markdown.sarif) {
      rumdlSarif = rumdlSarif ? mergeSarif(rumdlSarif, markdown.sarif) : markdown.sarif;
    }
    if (options.visual) {
      const visual = await lintVisualDeck({ project, deck });
      if (visual === null) {
        throw playwrightMissingError();
      }
      diagnostics.push(...visual);
    }
  }

  return {
    diagnostics: uniqueDiagnostics(diagnostics),
    ...skippedChecks(rumdlSkip ? [rumdlSkip] : []),
    ...(rumdlSarif ? { rumdlSarif } : {}),
  };
}

export const RUMDL_INSTALL = "bun add -d rumdl; or put rumdl on PATH, or set DEK_RUMDL to its path";

/** Why rumdl gave no result: dek looks for it on PATH, in node_modules/.bin, and at DEK_RUMDL. */
function rumdlSkipped(scriptPath: string, cwd: string): SkippedCheck {
  const bin = resolveRumdlBin();
  if (bin === undefined || !existsSync(bin)) {
    return { check: "rumdl", reason: "rumdl is not installed", hint: RUMDL_INSTALL };
  }
  return {
    check: "rumdl",
    reason: "rumdl ran but gave no result",
    hint: `run \`${bin} check ${relative(cwd, scriptPath) || scriptPath}\` to see why`,
  };
}
