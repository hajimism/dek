import type { CheckOutput } from "../../plugin-api.ts";
import type { Finding } from "./check.ts";
import type { RuleId } from "./manifest.ts";
import { MANIFEST } from "./manifest.ts";

/** Findings as the SARIF dek reads: the rule, the message, the place, and the hint. */
export function toSarif(findings: Finding[]): CheckOutput<RuleId> {
  return {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: { driver: { name: "dek-study", version: MANIFEST.version } },
        results: findings.map((finding) => ({
          ruleId: finding.rule,
          message: { text: finding.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: finding.path },
                region: { startLine: finding.line },
              },
            },
          ],
          properties: { hint: finding.hint },
        })),
      },
    ],
  };
}
