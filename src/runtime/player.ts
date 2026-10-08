import { join } from "node:path";

export { liveReloadScript } from "./live-reload.ts";

let player: Promise<string> | undefined;
let livePlayer: Promise<string> | undefined;
let annotate: Promise<string> | undefined;

/** The player a file that stands alone runs: a build, a video, a shot. */
export function playerScript(): Promise<string> {
  player ??= compile("browser.ts", "player");
  return player;
}

/**
 * The player the dev server's pages run: the same player, and its line to the server besides,
 * which a file that stands alone has no server for.
 */
export function livePlayerScript(): Promise<string> {
  livePlayer ??= compile("browser-live.ts", "live player");
  return livePlayer;
}

/** Annotate mode, which only the dev server's pages for the speaker run, after the player. */
export function annotateScript(): Promise<string> {
  annotate ??= compile("annotate.ts", "annotate mode");
  return annotate;
}

async function compile(entry: string, what: string): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, entry)],
    target: "browser",
    format: "iife",
    minify: true,
  });
  if (!result.success) {
    const details = result.logs.map((log) => String(log)).join("\n");
    throw new Error(`failed to compile ${what}\n${details}`);
  }
  const output = result.outputs[0];
  if (!output) {
    throw new Error(`failed to compile ${what}: no output`);
  }
  return output.text();
}
