import { existsSync } from "node:fs";
import { relative } from "node:path";
import type { Diagnostic } from "../core/diagnostic.ts";
import { shellQuote } from "../core/escape.ts";
import { lintDeck, lintProject, unreadableScriptDiagnostics } from "../core/lint.ts";
import { playwrightMissingError } from "../core/playwright.ts";
import { checkDeck, onProjectData, pluginChecks } from "../core/plugin-host.ts";
import { type RumdlRunner, type RumdlSkip, resolveRumdlBin, runRumdl } from "../core/rumdl.ts";
import { mergeSarif, pluginSarif, type SarifLog } from "../core/sarif.ts";
import { syncDeck } from "../core/sync.ts";
import { lintVisualDeck } from "../core/visual.ts";
import { RENDERED_RULES, type SkippedCheck, skippedChecks, visualSkipped } from "./result.ts";
import type { DecksTarget } from "./scope.ts";

export type LintCliResult = {
  diagnostics: Diagnostic[];
  /** Checks that did not run, each with why and how to run it, so an empty list is not a pass. */
  skipped?: SkippedCheck[];
  rumdlSarif?: SarifLog;
  /** A run per plugin that ran, for `--format sarif`. */
  pluginSarif?: SarifLog;
};

/** `cwd` is where a skipped rumdl's hint says to run it from; `rumdl` runs it, dek's by default. */
export async function lintCommand(
  { project, decks, failed = [] }: DecksTarget,
  options: { cwd: string; fix?: boolean; visual?: boolean; rumdl?: RumdlRunner },
): Promise<LintCliResult> {
  // dek.toml's findings once, then each deck's.
  const diagnostics: Diagnostic[] = [
    ...lintProject(project),
    ...failed.flatMap(unreadableScriptDiagnostics),
  ];
  let rumdlSkip: SkippedCheck | undefined;
  let rumdlSarif: SarifLog | undefined;
  // A rumdl that hung on one deck would hang on each, half a minute apiece.
  let rumdlHung = false;
  // The plugins as the project accepted them; one that hung is run on no deck after, as rumdl.
  const plugins = await pluginChecks(project);
  diagnostics.push(...plugins.diagnostics);
  const pluginRuns = plugins.ready.map((plugin) => ({
    ...plugin,
    diagnostics: [] as Diagnostic[],
    hungOn: undefined as string | undefined,
    skippedDecks: 0,
    seen: new Set<string>(),
  }));

  for (const deck of decks) {
    if (options.fix) {
      syncDeck({ project, deck });
    }
    diagnostics.push(...lintDeck({ project, deck }));
    if (!rumdlHung) {
      const markdown = await runRumdl(deck.scriptPath, options.rumdl);
      diagnostics.push(...markdown.diagnostics);
      // One entry for the run: the first reason, unless rumdl hung, which covers every deck after.
      if (markdown.skipped && (!rumdlSkip || markdown.skipped.hung)) {
        rumdlSkip = rumdlSkipped(deck.scriptPath, options.cwd, markdown.skipped);
      }
      rumdlHung = markdown.skipped?.hung === true;
      if (markdown.sarif) {
        rumdlSarif = rumdlSarif ? mergeSarif(rumdlSarif, markdown.sarif) : markdown.sarif;
      }
    }
    for (const plugin of pluginRuns) {
      if (plugin.hungOn !== undefined) {
        plugin.skippedDecks += 1;
        continue;
      }
      const outcome = await checkDeck(plugin, project, deck);
      // A finding on the project's data comes back from each deck; it is reported once (ADR 35).
      const fresh = outcome.diagnostics.filter((finding) => {
        if (!onProjectData(finding, project.root, plugin.name)) {
          return true;
        }
        const { id, path, line, column, message } = finding;
        const key = JSON.stringify([id, path, line, column, message]);
        if (plugin.seen.has(key)) {
          return false;
        }
        plugin.seen.add(key);
        return true;
      });
      diagnostics.push(...fresh);
      plugin.diagnostics.push(...fresh.filter(({ id }) => id !== "DEK046"));
      if (outcome.hung) {
        plugin.hungOn = deck.name;
      }
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
    ...skippedChecks([
      ...(rumdlSkip ? [rumdlSkip] : []),
      ...plugins.skipped,
      ...pluginRuns.flatMap((plugin): SkippedCheck[] =>
        plugin.skippedDecks > 0
          ? [
              {
                check: "plugin",
                plugin: plugin.name,
                reason: `dek-${plugin.name} hung on ${plugin.hungOn}, so it ran on no deck after`,
                hint: `tell the user: dek-${plugin.name} hangs, and its author can fix it`,
              },
            ]
          : [],
      ),
      ...(options.visual
        ? []
        : [
            visualSkipped("dekc lint --visual", {
              reason: `${RENDERED_RULES} are measured only with --visual`,
            }),
          ]),
    ]),
    ...(rumdlSarif ? { rumdlSarif } : {}),
    ...(pluginRuns.length > 0 ? { pluginSarif: pluginSarif(pluginRuns) } : {}),
  };
}

const RUMDL_INSTALL = "bun add -d rumdl; or put rumdl on PATH, or set DEK_RUMDL to its path";

const RUMDL_HUNG =
  "update or reinstall rumdl (`bun add -d rumdl@latest`), or set DEK_RUMDL to a rumdl that finishes; lint skips it for every deck after one it hangs on";

/**
 * Why rumdl gave no result: whether dek found it, on PATH, in node_modules/.bin, or at DEK_RUMDL,
 * and the reason when dek knows it. One that hung would hang again, so its hint is not to rerun.
 */
function rumdlSkipped(scriptPath: string, cwd: string, skip: RumdlSkip): SkippedCheck {
  const bin = resolveRumdlBin();
  if (bin === undefined || !existsSync(bin)) {
    return { check: "rumdl", reason: "rumdl is not installed", hint: RUMDL_INSTALL };
  }
  if (skip.hung) {
    return {
      check: "rumdl",
      reason: skip.reason ?? "rumdl hung and was stopped",
      hint: RUMDL_HUNG,
    };
  }
  return {
    check: "rumdl",
    reason: skip.reason ?? "rumdl ran but gave no result",
    hint: `run \`${shellQuote(bin)} check ${shellQuote(relative(cwd, scriptPath) || scriptPath)}\` to see why`,
  };
}
