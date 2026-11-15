// Choosing a handle, once, after the first sign-in (ADR 77): the page offers one, says as the
// person types whether each may be chosen, and saves the one they choose.

import type { CallFailure } from "../../../../common/ui/call.ts";

/** What keeps a handle from being chosen, as the page tells it. */
export type HandleProblem = "invalid" | "reserved" | "taken" | "chosen" | CallFailure;

/** Where the handle in the field stands: being asked about, free to choose, or not. */
export type HandleCheck =
  | { handle: string; state: "checking" | "free" }
  | { handle: string; state: "problem"; problem: HandleProblem };

/** The error code the API answers each problem with a choice with. */
export const HANDLE_CODES = {
  invalid: "handle_invalid",
  reserved: "handle_reserved",
  taken: "handle_taken",
  chosen: "handle_chosen",
} as const satisfies Record<Exclude<HandleProblem, CallFailure>, string>;

/** The page to choose a handle on, with the one it offers and where to go after; or where to go instead. */
export type Welcome = { next: string; suggestion: string | null } | { redirect: string };
