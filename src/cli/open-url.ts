import { DekError } from "../core/error.ts";
import { runPiped } from "../core/spawn.ts";

/** `open` returns once the browser has the URL; one that takes longer than this is stuck. */
const OPEN_TIMEOUT_MS = 15 * 1000;

/**
 * Open `url` in the user's browser: the program BROWSER names, else `open` on macOS and
 * `xdg-open` elsewhere. A machine with neither, such as a server, is told to open it by hand.
 */
export async function openInBrowser(
  url: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  const browser = env.BROWSER?.trim();
  const program = browser || (process.platform === "darwin" ? "open" : "xdg-open");
  const hint = `open ${url} in a browser yourself`;
  const run = await runPiped([program, url], {
    label: `${program} did not open the browser`,
    hint,
    timeoutMs: OPEN_TIMEOUT_MS,
  });
  if (run.exitCode !== 0) {
    throw new DekError(`${program} did not open the browser`, { hint });
  }
}
