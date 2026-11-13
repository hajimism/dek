// Approving `dekc pub login` in the browser: the code the terminal shows is looked up, then
// approved or denied.

export type DeviceProblem = "invalid" | "expired" | "used" | "offline";

export type DeviceLookup =
  | { ok: true; scope: string | null }
  | { ok: false; problem: DeviceProblem };
