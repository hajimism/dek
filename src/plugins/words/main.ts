#!/usr/bin/env bun
/**
 * dek-words, the second plugin dek ships (ADR 36). dek runs it as any plugin (ADR 32), in a bun of its
 * own: `manifest` to pin what it promises, and `check --protocol 1` in a deck's folder, with the
 * deck on stdin, for SARIF. It shares only the types in plugin-api.ts with dek, never its code.
 */
import { readFileSync } from "node:fs";
import type { CheckInput } from "../../plugin-api.ts";
import { check } from "./check.ts";
import { MANIFEST } from "./manifest.ts";
import { toSarif } from "./sarif.ts";

const USAGE = "usage: dek-words manifest | dek-words check --protocol 1  (dek runs both)";

async function main(args: string[]): Promise<number> {
  switch (args[0]) {
    case "manifest":
      process.stdout.write(`${JSON.stringify(MANIFEST)}\n`);
      return 0;
    case "check": {
      if (args[1] !== "--protocol" || args[2] !== "1") {
        process.stderr.write(
          `dek-words speaks check protocol 1; dek asked for ${args.slice(1).join(" ")}\n`,
        );
        return 2;
      }
      const input = JSON.parse(await Bun.stdin.text()) as CheckInput;
      const findings = await check(input, async (path) => readIfThere(path));
      process.stdout.write(`${JSON.stringify(toSarif(findings))}\n`);
      return 0;
    }
    default:
      process.stderr.write(`${USAGE}\n`);
      return 2;
  }
}

/**
 * A file of the deck, relative to its folder, which is where dek runs the check, or the project's
 * list by its absolute path.
 */
function readIfThere(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

process.exit(await main(process.argv.slice(2)));
