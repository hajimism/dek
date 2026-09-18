import type { Diagnostic } from "./diagnostic.ts";

export type SarifLog = {
  version: "2.1.0";
  $schema: string;
  runs: Array<{
    tool: { driver: { name: string } };
    results: Array<{
      ruleId: string;
      message: { text: string };
      locations?: Array<{
        physicalLocation: {
          artifactLocation: { uri: string };
          region?: { startLine: number };
        };
      }>;
    }>;
  }>;
};

export function toSarif(diagnostics: Diagnostic[]): SarifLog {
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: { driver: { name: "dek" } },
        results: diagnostics.map((diagnostic) => ({
          ruleId: diagnostic.id,
          message: { text: diagnostic.message },
          ...(diagnostic.path
            ? {
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: diagnostic.path },
                      ...(diagnostic.line !== undefined
                        ? { region: { startLine: diagnostic.line } }
                        : {}),
                    },
                  },
                ],
              }
            : {}),
        })),
      },
    ],
  };
}

export function mergeSarif(dek: SarifLog, rumdl?: SarifLog): SarifLog {
  return {
    version: "2.1.0",
    $schema: dek.$schema,
    runs: [...dek.runs, ...(rumdl?.runs ?? [])],
  };
}
