/** An error means the deck is not done; a warning is worth a look but does not fail lint. */
export type Severity = "error" | "warning";

/**
 * What a finding is about. A slide finding names its slide (`slug`), and `dekc check <slug>`
 * reports exactly those; a deck finding is about a file the slides share, such as theme.css
 * or the frontmatter; a project finding is about dekc.toml, one per project however many decks.
 * `dekc lint` reports all three.
 */
export type Scope = "project" | "deck" | "slide";

/**
 * The rule table: every diagnostic dekc itself emits, with its severity and the scopes it is
 * found in. A rule that reads a shared file and a slide's own, like DEKC014 on theme.css and on
 * slides/<slug>.css, has both. Voice and timing rules are warnings: a live-only deck is done
 * without them. So are the findings about input dekc ignores (DEKC008) or reads another way
 * (DEKC044), an empty heading (DEKC024), which a slide script may fill, and a step bound by
 * position where the beat has an id (DEKC025), which is right until a beat is inserted, and a
 * style several slides repeat (DEKC026), which works but belongs in the theme. Text under
 * aria-hidden (DEKC029) is right on a sample the talk shows as unreadable.
 */
export const RULES = {
  DEKC001: { severity: "error", scopes: ["slide"] },
  DEKC002: { severity: "error", scopes: ["slide"] },
  DEKC003: { severity: "error", scopes: ["slide"] },
  DEKC004: { severity: "error", scopes: ["slide"] },
  DEKC005: { severity: "error", scopes: ["slide"] },
  DEKC006: { severity: "error", scopes: ["slide"] },
  DEKC007: { severity: "error", scopes: ["slide"] },
  DEKC008: { severity: "warning", scopes: ["project", "deck"] },
  DEKC009: { severity: "error", scopes: ["slide"] },
  DEKC010: { severity: "error", scopes: ["slide"] },
  DEKC011: { severity: "error", scopes: ["slide"] },
  DEKC012: { severity: "error", scopes: ["deck", "slide"] },
  DEKC013: { severity: "error", scopes: ["deck"] },
  DEKC014: { severity: "error", scopes: ["deck", "slide"] },
  DEKC015: { severity: "error", scopes: ["deck"] },
  DEKC016: { severity: "error", scopes: ["slide"] },
  DEKC017: { severity: "error", scopes: ["slide"] },
  DEKC018: { severity: "error", scopes: ["deck"] },
  DEKC019: { severity: "error", scopes: ["slide"] },
  DEKC020: { severity: "error", scopes: ["deck", "slide"] },
  DEKC021: { severity: "error", scopes: ["deck", "slide"] },
  DEKC022: { severity: "error", scopes: ["deck", "slide"] },
  DEKC023: { severity: "error", scopes: ["deck", "slide"] },
  DEKC024: { severity: "warning", scopes: ["slide"] },
  DEKC025: { severity: "warning", scopes: ["slide"] },
  DEKC026: { severity: "warning", scopes: ["slide"] },
  DEKC027: { severity: "error", scopes: ["deck"] },
  DEKC028: { severity: "warning", scopes: ["slide"] },
  DEKC029: { severity: "warning", scopes: ["slide"] },
  DEKC030: { severity: "error", scopes: ["slide"] },
  DEKC031: { severity: "error", scopes: ["slide"] },
  DEKC032: { severity: "error", scopes: ["slide"] },
  DEKC033: { severity: "error", scopes: ["slide"] },
  DEKC040: { severity: "warning", scopes: ["slide"] },
  DEKC041: { severity: "warning", scopes: ["deck"] },
  DEKC042: { severity: "warning", scopes: ["slide"] },
  DEKC043: { severity: "warning", scopes: ["deck"] },
  DEKC044: { severity: "warning", scopes: ["deck", "slide"] },
  DEKC045: { severity: "warning", scopes: ["deck"] },
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

/** A diagnostic of one dekc rule; its severity comes from the rule table. */
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
