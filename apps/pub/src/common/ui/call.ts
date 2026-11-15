// What a page makes of one of its calls to dek.pub: what it answered, or why it did not do what was
// asked, as a problem the page has words for; and a change the page shows before the call is made.

import { ApiFailure } from "./api.ts";

/** Why a call failed beyond the problems a page names: dek.pub was not reached, or it said why. */
export type CallFailure = "offline" | "failed";

/** A call done, with what it answered; or not, with its problem and the server's message. */
export type Called<T, Problem extends string = never> =
  | { ok: true; value: T }
  | { ok: false; problem: Problem | CallFailure; message: string };

/**
 * Why a call failed, from the error it threw: the problem whose code in `codes` the error carries,
 * `offline` when dek.pub was not reached, or else `failed`, with the server's message. `codes` is
 * the table the server answers each problem with, so both sides read one.
 */
export function failureOf<Problem extends string = never>(
  error: unknown,
  codes: Readonly<Record<Problem, string>> = {} as Record<Problem, string>,
): Extract<Called<never, Problem>, { ok: false }> {
  if (!(error instanceof ApiFailure)) {
    return { ok: false, problem: "failed", message: "" };
  }
  if (error.code === "offline") {
    return { ok: false, problem: "offline", message: "" };
  }
  const problem = (Object.keys(codes) as Problem[]).find((each) => codes[each] === error.code);
  return { ok: false, problem: problem ?? "failed", message: error.message };
}

/** What `call` answered, or why it failed, as failureOf reads it by `codes`. */
export async function called<T, Problem extends string = never>(
  call: () => Promise<T>,
  codes?: Readonly<Record<Problem, string>>,
): Promise<Called<T, Problem>> {
  try {
    return { ok: true, value: await call() };
  } catch (error) {
    return failureOf(error, codes);
  }
}

/** A value a page shows, read and set through these, as a `$state` is from outside its component. */
export type Shown<T> = { get(): T; set(value: T): void };

/**
 * Show `next` at once, then make `call`, and show what it answers, the value as the server has it.
 * If it fails, what was shown before comes back and `failed` hears why. Whether it went through.
 */
export async function showFirst<T>(
  shown: Shown<T>,
  next: T,
  call: () => Promise<T>,
  failed: (error: unknown) => void,
): Promise<boolean> {
  const before = shown.get();
  shown.set(next);
  try {
    shown.set(await call());
    return true;
  } catch (error) {
    shown.set(before);
    failed(error);
    return false;
  }
}
