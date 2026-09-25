/** An error means the deck is not done; a warning is worth a look but does not fail lint. */
export type Severity = "error" | "warning";

/**
 * The rule table: every diagnostic dek itself emits, with its severity. Voice
 * and timing rules are warnings: a live-only deck is done without them. So are the
 * findings about input dek ignores (DEK008) or reads another way (DEK044), an empty
 * heading (DEK024), which a slide script may fill, and a step bound by position where the
 * beat has an id (DEK025), which is right until a beat is inserted.
 */
export const RULES = {
  DEK001: { severity: "error" },
  DEK002: { severity: "error" },
  DEK003: { severity: "error" },
  DEK004: { severity: "error" },
  DEK005: { severity: "error" },
  DEK006: { severity: "error" },
  DEK007: { severity: "error" },
  DEK008: { severity: "warning" },
  DEK009: { severity: "error" },
  DEK010: { severity: "error" },
  DEK011: { severity: "error" },
  DEK012: { severity: "error" },
  DEK013: { severity: "error" },
  DEK014: { severity: "error" },
  DEK015: { severity: "error" },
  DEK016: { severity: "error" },
  DEK017: { severity: "error" },
  DEK018: { severity: "error" },
  DEK019: { severity: "error" },
  DEK020: { severity: "error" },
  DEK021: { severity: "error" },
  DEK022: { severity: "error" },
  DEK023: { severity: "error" },
  DEK024: { severity: "warning" },
  DEK025: { severity: "warning" },
  DEK030: { severity: "error" },
  DEK031: { severity: "error" },
  DEK040: { severity: "warning" },
  DEK041: { severity: "warning" },
  DEK042: { severity: "warning" },
  DEK043: { severity: "warning" },
  DEK044: { severity: "warning" },
} as const satisfies Record<string, { severity: Severity }>;

export type RuleId = keyof typeof RULES;

export type Diagnostic = {
  id: string;
  severity: Severity;
  message: string;
  path?: string;
  line?: number;
  /** 1-based, in UTF-16 units as editors count; set when the rule knows where on the line. */
  column?: number;
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

export type DiagnosticFields = Omit<Diagnostic, "id" | "severity">;

/** A diagnostic of one dek rule; its severity comes from the rule table. */
export function diag(id: RuleId, fields: DiagnosticFields): Diagnostic {
  // Severity right after the id, so it reads first in --json.
  return { id, severity: RULES[id].severity, ...fields };
}

/** A diagnostic from outside the rule table, such as rumdl's or a crash: always an error. */
export function errorDiagnostic(id: string, fields: DiagnosticFields): Diagnostic {
  return { id, severity: "error", ...fields };
}

export function hasErrors(diagnostics: Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

/** The diagnostics without repeats, in order: dek.toml findings come back from every deck. */
export function uniqueDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = JSON.stringify([
      diagnostic.id,
      diagnostic.path,
      diagnostic.line,
      diagnostic.column,
      diagnostic.message,
    ]);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * A check a command did not run, so its empty diagnostics are not a pass for it: why it did not
 * run, and what to do so that it does.
 */
export type SkippedCheck = {
  check: "lint" | "rumdl" | "visual" | "voice";
  reason: string;
  hint?: string;
};
