// Choosing a handle, once, after the first sign-in (ADR 77): the page offers one, says as the
// person types whether each may be chosen, and saves the one they choose.

/** What keeps a handle from being chosen, as the page tells it. */
export type HandleProblem = "invalid" | "reserved" | "taken" | "chosen" | "offline" | "failed";

/** Where the handle in the field stands: being asked about, free to choose, or not. */
export type HandleCheck =
  | { handle: string; state: "checking" | "free" }
  | { handle: string; state: "problem"; problem: HandleProblem };

/** The error codes the API answers a choice with, by what they say of it. */
export const CHOICE_ERRORS = {
  handle_invalid: "invalid",
  handle_reserved: "reserved",
  handle_taken: "taken",
  handle_chosen: "chosen",
} as const satisfies Record<string, HandleProblem>;

/** The page to choose a handle on, with the one it offers and where to go after; or where to go instead. */
export type Welcome = { next: string; suggestion: string | null } | { redirect: string };
