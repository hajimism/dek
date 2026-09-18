import { join } from "node:path";

export { liveReloadScript } from "./live-reload.ts";

let compiled: Promise<string> | undefined;

export function playerScript(): Promise<string> {
  compiled ??= compilePlayer();
  return compiled;
}

async function compilePlayer(): Promise<string> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "browser.ts")],
    target: "browser",
    format: "iife",
    minify: true,
  });
  if (!result.success) {
    const details = result.logs.map((log) => String(log)).join("\n");
    throw new Error(`failed to compile player\n${details}`);
  }
  const output = result.outputs[0];
  if (!output) {
    throw new Error("failed to compile player: no output");
  }
  return output.text();
}
