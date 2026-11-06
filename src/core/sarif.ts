import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  type Diagnostic,
  type DiagnosticValue,
  RULES,
  type SkippedCheck,
  skippedLabel,
} from "./diagnostic.ts";
import type { PluginManifest } from "./plugin.ts";

type SarifLevel = "error" | "warning" | "note" | "none";

export type SarifLog = {
  version: "2.1.0";
  $schema: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version?: string;
        informationUri?: string;
        rules?: Array<{
          id: string;
          shortDescription?: { text: string };
          defaultConfiguration: { level: SarifLevel };
          helpUri?: string;
        }>;
      };
    };
    invocations?: Array<{
      executionSuccessful: boolean;
      toolExecutionNotifications?: Array<{
        level: SarifLevel;
        message: { text: string };
        descriptor: { id: string };
        properties?: { [key: string]: DiagnosticValue };
      }>;
    }>;
    results: Array<{
      ruleId: string;
      level?: SarifLevel;
      message: { text: string };
      locations?: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region?: { startLine: number; startColumn?: number };
        };
      }>;
      properties?: { [key: string]: DiagnosticValue };
    }>;
  }>;
};

const RULES_URI = "https://hajimism.github.io/dek/reference/lint.html";

/**
 * dek's own diagnostics as one SARIF run. The message stays as written; the hint, slug, and data
 * go in `properties`, the bag SARIF leaves to the tool. A check that did not run is a tool
 * execution notification, so a log without results never reads as a pass for it.
 */
export function toSarif(
  diagnostics: Diagnostic[],
  options: { skipped?: SkippedCheck[] } = {},
): SarifLog {
  const skipped = options.skipped ?? [];
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "dek",
            informationUri: "https://hajimism.github.io/dek/",
            rules: Object.entries(RULES).map(([id, rule]) => ({
              id,
              defaultConfiguration: { level: rule.severity },
              helpUri: RULES_URI,
            })),
          },
        },
        ...(skipped.length > 0
          ? {
              invocations: [
                {
                  executionSuccessful: true,
                  toolExecutionNotifications: skipped.map((entry) => ({
                    level: "warning" as const,
                    message: { text: `${skippedLabel(entry)}: skipped (${entry.reason})` },
                    descriptor: { id: `skipped/${entry.check}` },
                    properties: {
                      check: entry.check,
                      ...(entry.plugin === undefined ? {} : { plugin: entry.plugin }),
                      ...(entry.hint === undefined ? {} : { hint: entry.hint }),
                    },
                  })),
                },
              ],
            }
          : {}),
        results: diagnostics.map(sarifResult),
      },
    ],
  };
}

/**
 * Each plugin's findings as a run of its own, under the plugin's name and version, with the rules
 * its accepted manifest declares. A plugin that found nothing still has its run: it ran.
 */
export function pluginSarif(
  plugins: Array<{ name: string; manifest: PluginManifest; diagnostics: Diagnostic[] }>,
): SarifLog {
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: plugins.map(({ name, manifest, diagnostics }) => ({
      tool: {
        driver: {
          name: `dek-${name}`,
          version: manifest.version,
          rules: Object.entries(manifest.check?.rules ?? {}).map(([id, rule]) => ({
            id,
            shortDescription: { text: rule.summary },
            defaultConfiguration: { level: rule.severity },
          })),
        },
      },
      results: diagnostics.map(sarifResult),
    })),
  };
}

function sarifResult(diagnostic: Diagnostic): SarifLog["runs"][number]["results"][number] {
  const properties = {
    ...(diagnostic.slug === undefined ? {} : { slug: diagnostic.slug }),
    ...(diagnostic.hint === undefined ? {} : { hint: diagnostic.hint }),
    ...(diagnostic.data === undefined ? {} : { data: diagnostic.data }),
  };
  return {
    ruleId: diagnostic.id,
    level: diagnostic.severity,
    message: { text: diagnostic.message },
    ...(diagnostic.path
      ? {
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: pathToFileURL(resolve(diagnostic.path)).href },
                ...(diagnostic.line !== undefined
                  ? {
                      region: {
                        startLine: diagnostic.line,
                        ...(diagnostic.column === undefined
                          ? {}
                          : { startColumn: diagnostic.column }),
                      },
                    }
                  : {}),
              },
            },
          ],
        }
      : {}),
    ...(Object.keys(properties).length > 0 ? { properties } : {}),
  };
}

/** One log of every run in `dek` and the logs after it, such as rumdl's and the plugins'. */
export function mergeSarif(dek: SarifLog, ...others: Array<SarifLog | undefined>): SarifLog {
  return {
    version: "2.1.0",
    $schema: dek.$schema,
    runs: [...dek.runs, ...others.flatMap((log) => log?.runs ?? [])],
  };
}
