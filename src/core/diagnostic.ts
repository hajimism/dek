export type RuleId =
  | "DEK001"
  | "DEK002"
  | "DEK003"
  | "DEK004"
  | "DEK005"
  | "DEK006"
  | "DEK010"
  | "DEK011"
  | "DEK012"
  | "DEK013"
  | "DEK014"
  | "DEK015"
  | "DEK016"
  | "DEK017"
  | "DEK020"
  | "DEK021"
  | "DEK022"
  | "DEK023"
  | "DEK030"
  | "DEK031"
  | "DEK040"
  | "DEK041"
  | "DEK042"
  | "DEK043";

/** An error means the deck is not done; a warning is worth a look but does not fail lint. */
export type Severity = "error" | "warning";

export type Diagnostic = {
  id: string;
  /** Omitted by rules; filled in from the rule table by `withSeverity`. */
  severity?: Severity;
  message: string;
  path?: string;
  line?: number;
  slug?: string;
  /** The fix, phrased as what to do next. */
  hint?: string;
  /** The values the message names, such as the offending class or the overflow in px, as fields. */
  data?: { [key: string]: DiagnosticValue };
};

export type DiagnosticValue =
  | string
  | number
  | boolean
  | DiagnosticValue[]
  | { [key: string]: DiagnosticValue };

/** Voice and timing rules: a live-only deck is done without them. */
const WARNING_RULES: ReadonlySet<string> = new Set<RuleId>([
  "DEK040",
  "DEK041",
  "DEK042",
  "DEK043",
]);

/** The diagnostic's own severity, or the rule's. Anything outside the table, such as rumdl, is an error. */
export function severityOf(diagnostic: Diagnostic): Severity {
  return diagnostic.severity ?? (WARNING_RULES.has(diagnostic.id) ? "warning" : "error");
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => severityOf(diagnostic) === "error");
}

export function withSeverity(diagnostics: Diagnostic[]): Diagnostic[] {
  // Severity right after the id, so it reads first in --json.
  return diagnostics.map(({ id, ...rest }) => ({
    id,
    severity: severityOf({ id, ...rest }),
    ...rest,
  }));
}
