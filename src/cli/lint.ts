import type { Diagnostic } from "../core/diagnostic.ts";
import { lintDeck, syncDeck } from "../core/index.ts";
import { playwrightMissingError } from "../core/playwright.ts";
import { runRumdl } from "../core/rumdl.ts";
import { mergeSarif, type SarifLog } from "../core/sarif.ts";
import { lintVisualDeck } from "../core/visual.ts";
import { resolveDecks } from "./scope.ts";

export type LintCliResult = {
  diagnostics: Diagnostic[];
  rumdl: "ok" | "skipped";
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
  let rumdl: "ok" | "skipped" = "skipped";
  let rumdlSarif: SarifLog | undefined;

  for (const deck of decks) {
    if (options.fix) {
      syncDeck({ project, deck });
    }
    diagnostics.push(...lintDeck({ project, deck }));
    const markdown = await runRumdl(deck.scriptPath);
    diagnostics.push(...markdown.diagnostics);
    if (!markdown.skipped) {
      rumdl = "ok";
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
    rumdl,
    ...(rumdlSarif ? { rumdlSarif } : {}),
  };
}
