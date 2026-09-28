import { existsSync } from "node:fs";
import { relative } from "node:path";
import type { Diagnostic } from "../core/diagnostic.ts";
import { lintDeck, lintProject } from "../core/lint.ts";
import { playwrightMissingError } from "../core/playwright.ts";
import { resolveRumdlBin, runRumdl } from "../core/rumdl.ts";
import { mergeSarif, type SarifLog } from "../core/sarif.ts";
import { syncDeck } from "../core/sync.ts";
import { lintVisualDeck } from "../core/visual.ts";
import { type SkippedCheck, skippedChecks } from "./result.ts";
import type { DecksTarget } from "./scope.ts";

export type LintCliResult = {
  diagnostics: Diagnostic[];
  /** Checks that did not run, each with why and how to run it, so an empty list is not a pass. */
  skipped?: SkippedCheck[];
  rumdlSarif?: SarifLog;
};

/** `cwd` is where a skipped rumdl's hint says to run it from. */
export async function lintCommand(
  { project, decks }: DecksTarget,
  options: { cwd: string; fix?: boolean; visual?: boolean },
): Promise<LintCliResult> {
  // dek.toml's findings once, then each deck's.
  const diagnostics: Diagnostic[] = lintProject(project);
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
    diagnostics,
    ...skippedChecks(rumdlSkip ? [rumdlSkip] : []),
    ...(rumdlSarif ? { rumdlSarif } : {}),
  };
}

const RUMDL_INSTALL = "bun add -d rumdl; or put rumdl on PATH, or set DEK_RUMDL to its path";

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
