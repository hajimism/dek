import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WAIT_MS } from "./wait.ts";

const root = join(import.meta.dir, "..", "..");

/** Where the repository says to run the suite. */
const places = [
  "package.json",
  ".github/workflows/ci.yml",
  ".github/pull_request_template.md",
  "CONTRIBUTING.md",
  "README.md",
  "README.ja.md",
];

describe("the suite's default timeout", () => {
  // The preload's setDefaultTimeout reaches only the first test file of a sequential run.
  test("reaches every test file, wherever the suite is run", () => {
    const commands = places.flatMap((place) =>
      (readFileSync(join(root, place), "utf8").match(/bun test[^`"\n]*/g) ?? []).map((command) => ({
        place,
        command: command.trim(),
      })),
    );
    expect([...new Set(commands.map(({ place }) => place))]).toEqual(places);
    expect(commands.filter(({ command }) => !command.includes(`--timeout=${WAIT_MS * 2}`))).toEqual(
      [],
    );
  });
});
