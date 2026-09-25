import { AsyncLocalStorage } from "node:async_hooks";

/** Set while a callback holds the environment, so a call inside it does not wait on itself. */
const holding = new AsyncLocalStorage<true>();
let queue: Promise<unknown> = Promise.resolve();

/**
 * Runs `fn` with `env` applied to process.env, then puts every key back.
 * Calls take turns: async tests in a file run at once, and two overlapping
 * swaps would otherwise restore each other's values and leak one into later
 * files. A call inside another applies on top of it without waiting.
 */
export function withEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  if (holding.getStore()) {
    return swapEnv(env, fn);
  }
  const turn = queue.then(() => holding.run(true, () => swapEnv(env, fn)));
  queue = turn.catch(() => {});
  return turn;
}

async function swapEnv<T>(
  env: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    previous[key] = process.env[key];
    setEnv(key, value);
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      setEnv(key, value);
    }
  }
}

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
