/**
 * Evaluates compiled slide scripts for lint, away from the dek process.
 * Reads a JSON array of classic scripts on stdin and writes one JSON line per
 * script as it finishes. Each script runs in a fresh context with no host
 * objects, so it cannot reach Bun, process, or the file system, and a loop
 * that never ends is cut off; the parent's timeout covers anything that
 * escapes into the microtask queue.
 */
import { readFileSync, writeSync } from "node:fs";
import vm from "node:vm";

const SLIDE_EVAL_TIMEOUT_MS = 1000;

/** Runs inside the context, so reading the module's fields cannot run code in dek. */
const SUMMARY = `(function () {
  var module = globalThis.__dekSlides && globalThis.__dekSlides.slide;
  if (module === null || typeof module !== "object") return JSON.stringify({ object: false });
  var motion = module.motion;
  return JSON.stringify({
    object: true,
    draw: typeof module.draw,
    motion: motion === undefined ? "none"
      : motion === null || typeof motion !== "object" ? "invalid"
      : Object.keys(motion).map(function (key) {
          var ms = motion[key];
          return [key, typeof ms === "number" && isFinite(ms) ? ms : null];
        }),
  });
})()`;

function evaluate(code: string): string {
  const context = vm.createContext(Object.create(null));
  try {
    return vm.runInContext(
      `var window = globalThis;
try {
  new Function(${JSON.stringify(code)})();
} catch (error) {
  throw String(error && error.message !== undefined ? error.message : error);
}
${SUMMARY}`,
      context,
      { timeout: SLIDE_EVAL_TIMEOUT_MS },
    ) as string;
  } catch (error) {
    if (typeof error === "string") {
      return JSON.stringify({ threw: error });
    }
    return JSON.stringify({ timedOut: true });
  }
}

const scripts = JSON.parse(readFileSync(0, "utf8")) as string[];
for (const code of scripts) {
  writeSync(1, `${evaluate(code)}\n`);
}
// Exit before the event loop can drain promises the scripts queued.
process.exit(0);
