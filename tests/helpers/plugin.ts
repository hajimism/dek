import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const FAKE = join(import.meta.dir, "fake-plugin.ts");

/** A manifest for `quiz`, as a plugin prints it. */
export function quizManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 1,
    name: "quiz",
    version: "0.1.0",
    check: {
      protocol: 1,
      rules: {
        QUIZ001: { severity: "error", summary: "a sticker's text is not on its slide" },
        QUIZ002: { severity: "warning", summary: "a hidden word shows elsewhere" },
      },
    },
    data: [{ path: "quiz.yaml" }],
    ...overrides,
  };
}

export type FakePlugin = {
  bin: string;
  /** Change what the plugin does from its next run on. */
  set(behavior: Record<string, unknown>): void;
  /** Each run so far: its arguments, working directory, and stdin. */
  calls(): Array<{ args: string[]; cwd: string; stdin: string }>;
};

/**
 * Puts `dek-<name>` in `binDir`: a shell script that runs tests/helpers/fake-plugin.ts with bun,
 * doing what `behavior` says. Put `binDir` on PATH for dek to find it.
 */
export function installPlugin(
  binDir: string,
  name: string,
  behavior: Record<string, unknown>,
): FakePlugin {
  const bin = join(binDir, `dek-${name}`);
  const config = join(binDir, `dek-${name}.json`);
  writeFileSync(config, JSON.stringify(behavior));
  writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${FAKE}" "${config}" "$@"\n`);
  chmodSync(bin, 0o755);
  return {
    bin,
    set: (next) => writeFileSync(config, JSON.stringify(next)),
    calls: () => {
      try {
        return readFileSync(`${config}.calls`, "utf8")
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line));
      } catch {
        return [];
      }
    },
  };
}
