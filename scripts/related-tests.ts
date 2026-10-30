/**
 * Which tests speak for a change, for the Stop hook in scripts/agent-hooks.ts.
 *
 * A test speaks for a module when its file imports the module itself; one that reaches it only
 * through a helper or another module does not count. `bun test --changed` follows imports all the
 * way down and picks 63 of 187 files for a change to src/core/ref-name.ts, too many to run at the
 * end of every turn; CI runs the rest.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

const transpiler = new Bun.Transpiler({ loader: "ts" });

/** The repository's test files, relative to `root`, sorted. */
function testFiles(root: string): string[] {
  return [...new Bun.Glob("tests/**/*.test.ts").scanSync({ cwd: root })].sort();
}

/**
 * The files `file` (relative to `root`) imports by a relative path, relative to `root`. Type-only
 * imports run nothing, and the transpiler leaves them out.
 */
export function importsOf(file: string, code: string): string[] {
  return transpiler
    .scanImports(code)
    .map((entry) => entry.path)
    .filter((path) => path.startsWith("."))
    .map((path) => normalize(join(dirname(file), path)));
}

/** Each imported file, relative to `root`, with the test files that import it. */
export function importers(root: string, tests = testFiles(root)): Map<string, string[]> {
  const byModule = new Map<string, string[]>();
  for (const test of tests) {
    for (const module of importsOf(test, readFileSync(join(root, test), "utf8"))) {
      const list = byModule.get(module) ?? [];
      if (!list.includes(test)) list.push(test);
      byModule.set(module, list);
    }
  }
  return byModule;
}

/** The paths `git status --porcelain=v1 -z` names, the new one of a rename. */
export function parseStatus(output: string): string[] {
  const fields = output.split("\0");
  const paths: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i] ?? "";
    if (field.length < 4) continue;
    paths.push(field.slice(3));
    // A rename or a copy is followed by the path it came from.
    if (field[0] === "R" || field[0] === "C") i++;
  }
  return paths;
}

/** The test files to run for `changed`: those changed, and those importing a changed file. */
export function testsFor(
  root: string,
  changed: readonly string[],
  byModule: ReadonlyMap<string, readonly string[]>,
): string[] {
  const tests = new Set<string>();
  for (const path of changed) {
    if (path.endsWith(".test.ts")) tests.add(path);
    for (const test of byModule.get(path) ?? []) tests.add(test);
  }
  return [...tests].filter((test) => existsSync(join(root, test))).sort();
}
