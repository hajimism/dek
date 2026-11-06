#!/usr/bin/env bun
/**
 * A plugin for tests, run as `dek-<name>` through the wrapper tests/helpers/plugin.ts writes. Its
 * first argument is a JSON file that says what to do, read on every run so a test can change the
 * plugin between runs; each run is logged beside it, one JSON line per call.
 */
import { appendFileSync, readFileSync } from "node:fs";

type Behavior = {
  manifest?: unknown;
  /** Printed by `manifest` instead of the manifest. */
  manifestRaw?: string;
  sarif?: unknown;
  /** Printed by `check` instead of the SARIF. */
  sarifRaw?: string;
  exit?: number;
  /** The exit code of `check` alone, when `exit` is not set. */
  checkExit?: number;
  sleepMs?: number;
};

const [configPath = "", ...args] = Bun.argv.slice(2);
const behavior = JSON.parse(readFileSync(configPath, "utf8")) as Behavior;
const stdin = args[0] === "check" ? await Bun.stdin.text() : "";
appendFileSync(`${configPath}.calls`, `${JSON.stringify({ args, cwd: process.cwd(), stdin })}\n`);

if (behavior.sleepMs) {
  await Bun.sleep(behavior.sleepMs);
}
if (args[0] === "manifest") {
  process.stdout.write(behavior.manifestRaw ?? JSON.stringify(behavior.manifest));
} else if (args[0] === "check") {
  process.stdout.write(
    behavior.sarifRaw ?? JSON.stringify(behavior.sarif ?? { version: "2.1.0", runs: [] }),
  );
}
process.exit(behavior.exit ?? (args[0] === "check" ? behavior.checkExit : undefined) ?? 0);
