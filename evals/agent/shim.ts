/**
 * The `dekc` an agent finds first on PATH during an eval:
 *
 *   bun evals/agent/shim.ts <log> <project> [dekc arguments...]
 *
 * It runs this checkout's CLI as typed, passes its output through untouched, and appends what it
 * ran and printed to the run's log, so the report rests on what dek said, whatever the agent.
 */
import { appendFileSync } from "node:fs";
import { relative } from "node:path";
import type { Invocation } from "./report.ts";
import { cliPath } from "./scenario.ts";

const [log = "", project = "", ...argv] = process.argv.slice(2);
const started = performance.now();
const proc = Bun.spawn([process.execPath, cliPath, ...argv], {
  stdin: "inherit",
  stdout: "pipe",
  stderr: "pipe",
});
// A dev server the agent stops stops with its shim.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => proc.kill(signal));
}
const [stdout, stderr] = await Promise.all([
  tee(proc.stdout, process.stdout),
  tee(proc.stderr, process.stderr),
]);
const exitCode = await proc.exited;
const entry: Invocation = {
  argv,
  cwd: relative(project, process.cwd()) || ".",
  exitCode,
  stdout,
  stderr,
  ms: Math.round(performance.now() - started),
};
appendFileSync(log, `${JSON.stringify(entry)}\n`);
// Not process.exit: a pipe may still hold the output.
process.exitCode = exitCode;

async function tee(from: ReadableStream<Uint8Array>, to: NodeJS.WriteStream): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  for await (const chunk of from) {
    to.write(chunk);
    text += decoder.decode(chunk, { stream: true });
  }
  return text + decoder.decode();
}
