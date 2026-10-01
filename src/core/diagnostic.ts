/** An error means the deck is not done; a warning is worth a look but does not fail lint. */
export type Severity = "error" | "warning";

/**
 * What a finding is about. A slide finding names its slide (`slug`), and `dekc check <slug>`
 * reports exactly those; a deck finding is about a file the slides share, such as theme.css
 * or the frontmatter; a project finding is about dek.toml, one per project however many decks.
 * `dekc lint` reports all three.
 */
export type Scope = "project" | "deck" | "slide";

/**
 * The rule table: every diagnostic dek itself emits, with its severity and the scopes it is
 * found in. A rule that reads a shared file and a slide's own, like DEK014 on theme.css and on
 * slides/<slug>.css, has both. Voice and timing rules are warnings: a live-only deck is done
 * without them. So are the findings about input dek ignores (DEK008) or reads another way
 * (DEK044), an empty heading (DEK024), which a slide script may fill, and a step bound by
 * position where the beat has an id (DEK025), which is right until a beat is inserted, and a
 * style several slides repeat (DEK026), which works but belongs in the theme. Text under
 * aria-hidden (DEK029) is right on a sample the talk shows as unreadable.
 */
export const RULES = {
  DEK001: { severity: "error", scopes: ["slide"] },
  DEK002: { severity: "error", scopes: ["slide"] },
  DEK003: { severity: "error", scopes: ["slide"] },
  DEK004: { severity: "error", scopes: ["slide"] },
  DEK005: { severity: "error", scopes: ["slide"] },
  DEK006: { severity: "error", scopes: ["slide"] },
  DEK007: { severity: "error", scopes: ["slide"] },
  DEK008: { severity: "warning", scopes: ["project", "deck"] },
  DEK009: { severity: "error", scopes: ["slide"] },
  DEK010: { severity: "error", scopes: ["slide"] },
  DEK011: { severity: "error", scopes: ["slide"] },
  DEK012: { severity: "error", scopes: ["deck", "slide"] },
  DEK013: { severity: "error", scopes: ["deck"] },
  DEK014: { severity: "error", scopes: ["deck", "slide"] },
  DEK015: { severity: "error", scopes: ["deck"] },
  DEK016: { severity: "error", scopes: ["slide"] },
  DEK017: { severity: "error", scopes: ["slide"] },
  DEK018: { severity: "error", scopes: ["deck"] },
  DEK019: { severity: "error", scopes: ["slide"] },
  DEK020: { severity: "error", scopes: ["deck", "slide"] },
  DEK021: { severity: "error", scopes: ["deck", "slide"] },
  DEK022: { severity: "error", scopes: ["deck", "slide"] },
  DEK023: { severity: "error", scopes: ["deck", "slide"] },
  DEK024: { severity: "warning", scopes: ["slide"] },
  DEK025: { severity: "warning", scopes: ["slide"] },
  DEK026: { severity: "warning", scopes: ["slide"] },
  DEK027: { severity: "error", scopes: ["deck"] },
  DEK028: { severity: "warning", scopes: ["slide"] },
  DEK029: { severity: "warning", scopes: ["slide"] },
  DEK030: { severity: "error", scopes: ["slide"] },
  DEK031: { severity: "error", scopes: ["slide"] },
  DEK032: { severity: "error", scopes: ["slide"] },
  DEK033: { severity: "error", scopes: ["slide"] },
  DEK040: { severity: "warning", scopes: ["slide"] },
  DEK041: { severity: "warning", scopes: ["deck"] },
  DEK042: { severity: "warning", scopes: ["slide"] },
  DEK043: { severity: "warning", scopes: ["deck"] },
  DEK044: { severity: "warning", scopes: ["deck", "slide"] },
  DEK045: { severity: "warning", scopes: ["deck"] },
} as const satisfies Record<string, { severity: Severity; scopes: readonly Scope[] }>;

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

/**
 * A check a command did not run, so its empty diagnostics are not a pass for it: why it did not
 * run, and what to do so that it does.
 */
export type SkippedCheck = {
  /** `preview` is a build's link preview image, which needs a URL and Playwright. */
  check: "lint" | "preview" | "rumdl" | "visual" | "voice";
  reason: string;
  hint?: string;
};
