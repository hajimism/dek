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

/**
 * A value a page shows, read and set through these, as a `$state` is from outside its component.
 * Made once for each value, so `showFirst` knows the changes to it apart.
 */
export type Shown<T> = { get(): T; set(value: T): void };

/** The changes to one shown value still waiting on their call, and what the server last said. */
type Waiting = { made: number; waiting: Set<number>; answered: unknown; answeredBy: number };

const waitingOn = new WeakMap<object, Waiting>();

/**
 * Show `next` at once, then make `call`, and show what it answers, the value as the server has it.
 * If it fails, the value the server last answered comes back, or what was shown before the first
 * change still waiting, and `failed` hears why. A call that answers while a newer change to the
 * same value still waits shows nothing, so an older answer never shows over a newer change.
 * Whether it went through.
 */
export async function showFirst<T>(
  shown: Shown<T>,
  next: T,
  call: () => Promise<T>,
  failed: (error: unknown) => void,
): Promise<boolean> {
  const state = waitingOn.get(shown) ?? {
    made: 0,
    waiting: new Set<number>(),
    answered: undefined,
    answeredBy: 0,
  };
  waitingOn.set(shown, state);
  if (state.waiting.size === 0) {
    state.answered = shown.get();
    state.answeredBy = state.made;
  }
  state.made += 1;
  const turn = state.made;
  state.waiting.add(turn);
  shown.set(next);
  const newerWaits = () => [...state.waiting].some((other) => other > turn);
  try {
    const answer = await call();
    state.waiting.delete(turn);
    if (turn > state.answeredBy) {
      state.answered = answer;
      state.answeredBy = turn;
    }
    if (!newerWaits()) {
      shown.set(state.answered as T);
    }
    return true;
  } catch (error) {
    state.waiting.delete(turn);
    if (!newerWaits()) {
      shown.set(state.answered as T);
    }
    failed(error);
    return false;
  }
}
