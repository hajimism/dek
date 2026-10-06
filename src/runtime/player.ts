import { join } from "node:path";

export { liveReloadScript } from "./live-reload.ts";

let player: Promise<string> | undefined;
let annotate: Promise<string> | undefined;

/** The player every deck page runs. */
export function playerScript(): Promise<string> {
  player ??= compile("browser.ts", "player");
  return player;
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
