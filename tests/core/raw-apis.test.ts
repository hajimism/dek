import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { withTempDir } from "../helpers/fs.ts";

const REPO = join(import.meta.dir, "..", "..");
const BIOME = join(REPO, "node_modules", "@biomejs", "biome", "bin", "biome");

/** The rules that keep a raw API in the module that guards it, by the name a fixture uses. */
const RULES = {
  imports: "lint/style/noRestrictedImports",
  globals: "lint/style/noRestrictedGlobals",
  properties: "lint/nursery/noJsRestrictedProperties",
} as const;

const RAW_API_RULES: string[] = Object.values(RULES);

type Override = {
  includes: string[];
  linter?: { rules?: Record<string, Record<string, unknown>> };
};
type Config = { overrides: Override[] } & Record<string, unknown>;
type Diagnostic = { category: string; message: string; path: string; line: number };

const CONFIG = JSON.parse(readFileSync(join(REPO, "biome.json"), "utf8")) as Config;

/** The overrides that set the raw-API rules for all of src and for core; the others exempt. */
const SCOPES = new Set(["src/**", "src/core/**"]);

function rawApiRules(override: Override): string[] {
  return Object.entries(override.linter?.rules ?? {}).flatMap(([group, rules]) =>
    Object.keys(rules)
      .map((rule) => `lint/${group}/${rule}`)
      .filter((category) => RAW_API_RULES.includes(category)),
  );
}

const exemptions = CONFIG.overrides.filter(
  (override) =>
    rawApiRules(override).length > 0 && !override.includes.every((glob) => SCOPES.has(glob)),
);

/** Biome under a full test run has the machine to share with every other suite. */
const BIOME_TEST_TIMEOUT_MS = 60_000;

async function run(cwd: string, args: string[]): Promise<Diagnostic[]> {
  const proc = Bun.spawn(
    [process.execPath, BIOME, "lint", "--reporter=json", "--max-diagnostics=none", ...args],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  if (!stdout.startsWith("{")) {
    throw new Error(`biome printed no report: ${stderr}`);
  }
  const report = JSON.parse(stdout) as {
    diagnostics: Array<{ category: string; message: string; location: Record<string, unknown> }>;
  };
  return report.diagnostics.map(({ category, message, location }) => ({
    category,
    message,
    path: location.path as string,
    line: (location.start as { line: number }).line,
  }));
}

/** Lints `files`, each at its path in a copy of the repository, under `config`. */
async function lint(files: Record<string, string>, config: Config = CONFIG): Promise<Diagnostic[]> {
  return withTempDir(async (dir) => {
    // No `$schema`, whose path is the repository's, and no git in the copy to read ignores from.
    const { $schema: _schema, ...rest } = config;
    await writeFile(
      join(dir, "biome.json"),
      JSON.stringify({ ...rest, vcs: { enabled: false } }, null, 2),
    );
    for (const [path, code] of Object.entries(files)) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), code);
    }
    return run(dir, ["."]);
  });
}

/**
 * Each line marked `// ✗ <rule> <text>` must draw that rule with `<text>` in its message; no
 * other line may draw one of the raw-API rules.
 */
const FIXTURES: Record<string, string> = {
  "src/cli/fs-write.ts": `import { writeFileSync } from "node:fs"; // ✗ imports safe-fs.ts
writeFileSync("a", "b");
`,
  "src/cli/fs-whole.ts": `import * as fs from "node:fs"; // ✗ imports safe-fs.ts
fs.writeFileSync("a", "b");
`,
  "src/cli/fs-default.ts": `import fs from "node:fs"; // ✗ imports safe-fs.ts
fs.renameSync("a", "b");
`,
  "src/cli/fs-dynamic.ts": `const fs = await import("node:fs"); // ✗ imports safe-fs.ts
fs.rmSync("a");
export {};
`,
  "src/cli/fs-promises.ts": `import { writeFile } from "node:fs/promises"; // ✗ imports safe-fs.ts
await writeFile("a", "b");
`,
  "src/cli/fs-bare.ts": `import { appendFileSync } from "fs"; // ✗ imports safe-fs.ts
appendFileSync("a", "b");
`,
  "src/cli/fs-reads.ts": `import { existsSync, readFileSync } from "node:fs";
export const text = existsSync("a") ? readFileSync("a", "utf8") : "";
`,
  "src/cli/bun-write.ts": `await Bun.write("a", "b"); // ✗ properties Bun.write
export {};
`,
  "src/cli/spawn.ts": `Bun.spawn(["true"]); // ✗ properties Bun.spawn
Bun.spawnSync(["true"]); // ✗ properties Bun.spawnSync
await Bun.$\`true\`; // ✗ properties Bun.$
const { spawn } = Bun; // ✗ properties Bun.spawn
export { spawn };
`,
  "src/cli/child-process.ts": `import { spawn } from "node:child_process"; // ✗ imports spawn.ts
spawn("true");
`,
  "src/cli/bun-module.ts": `import { spawn } from "bun"; // ✗ imports spawn.ts
spawn(["true"]);
`,
  "src/cli/fetch.ts": `await fetch("https://example.com"); // ✗ globals fetch
await globalThis.fetch("https://example.com"); // ✗ properties globalThis.fetch
export {};
`,
  "src/core/fs-write.ts": `import { renameSync } from "node:fs"; // ✗ imports safe-fs.ts
import { main } from "../cli/main.ts"; // ✗ imports core must not depend
renameSync("a", "b");
export { main };
`,
  "src/core/archive.ts": `export const pack = new Bun.Archive({ a: "b" }); // ✗ properties Bun.Archive
`,
  "src/video/fetch.ts": `export const response = await fetch("http://127.0.0.1:1"); // ✗ globals fetch
`,
  // A guard is exempt from its own rule and held to every other one.
  "src/core/safe-fs.ts": `import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process"; // ✗ imports spawn.ts
import { main } from "../cli/main.ts"; // ✗ imports core must not depend
writeFileSync("a", "b");
Bun.spawn(["true"]); // ✗ properties Bun.spawn
export { main, spawn };
`,
  "src/core/spawn.ts": `import { writeFileSync } from "node:fs"; // ✗ imports safe-fs.ts
Bun.spawn(["true"]);
Bun.spawnSync(["true"]); // ✗ properties Bun.spawnSync
export const pack = new Bun.Archive({ a: "b" }); // ✗ properties Bun.Archive
writeFileSync("a", "b");
`,
  "src/core/pack.ts": `export const pack = new Bun.Archive({ a: "b" });
Bun.spawn(["true"]); // ✗ properties Bun.spawn
`,
  // The player runs in the browser, which has no other fetch.
  "src/runtime/fetch.ts": `export const response = await fetch("/deck.json");
Bun.spawn(["true"]); // ✗ properties Bun.spawn
`,
  // Tests write files, start programs, and serve fakes as they need to.
  "tests/free.test.ts": `import { writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
writeFileSync("a", "b");
spawn("true");
Bun.spawn(["true"]);
await fetch("http://127.0.0.1:1");
export const pack = new Bun.Archive({ a: "b" });
`,
};

type Expected = { line: number; category: string; text: string };

function expectations(code: string): Expected[] {
  return code.split("\n").flatMap((line, index) => {
    const mark = /\/\/ ✗ (imports|globals|properties) (.+)$/.exec(line);
    return mark?.[1] && mark[2]
      ? [{ line: index + 1, category: RULES[mark[1] as keyof typeof RULES], text: mark[2] }]
      : [];
  });
}

describe("raw APIs stay in the modules that guard them", () => {
  test(
    "each raw API draws its rule outside its guard, and only there",
    async () => {
      const diagnostics = (await lint(FIXTURES)).filter((d) => RAW_API_RULES.includes(d.category));
      for (const [path, code] of Object.entries(FIXTURES)) {
        const found = diagnostics
          .filter((d) => d.path === path)
          .map((d) => ({ line: d.line, category: d.category, message: d.message }));
        const wanted = expectations(code);
        const missed = wanted.filter((want) => !found.some((f) => matches(f, want)));
        expect({ path, found: found.length, missed }).toEqual({
          path,
          found: wanted.length,
          missed: [],
        });
      }
    },
    BIOME_TEST_TIMEOUT_MS,
  );

  test(
    "every file biome.json exempts from a raw-API rule needs the exemption",
    async () => {
      expect(exemptions.length).toBeGreaterThan(0);
      const files: Record<string, string> = {};
      for (const override of exemptions) {
        for (const path of coveredFiles(override)) {
          files[path] = readFileSync(join(REPO, path), "utf8");
        }
      }
      const without = {
        ...CONFIG,
        overrides: CONFIG.overrides.filter((o) => !exemptions.includes(o)),
      };
      const diagnostics = await lint(files, without);
      const unneeded = exemptions.flatMap((override) => {
        const covered = coveredFiles(override);
        return rawApiRules(override)
          .filter(
            (rule) => !diagnostics.some((d) => d.category === rule && covered.includes(d.path)),
          )
          .map((rule) => ({ exemption: override.includes, rule }));
      });
      expect(unneeded).toEqual([]);
    },
    BIOME_TEST_TIMEOUT_MS,
  );

  test(
    "every biome-ignore of a raw-API rule in src suppresses something",
    async () => {
      const suppressing = [...new Bun.Glob("src/**/*.ts").scanSync({ cwd: REPO })].filter((path) =>
        RAW_API_RULES.some((rule) =>
          readFileSync(join(REPO, path), "utf8").includes(`biome-ignore ${rule}:`),
        ),
      );
      expect(suppressing.length).toBeGreaterThan(0);
      const unused = (await run(REPO, suppressing)).filter(
        (d) => d.category === "suppressions/unused",
      );
      expect(unused).toEqual([]);
    },
    BIOME_TEST_TIMEOUT_MS,
  );
});

function matches(found: { line: number; category: string; message: string }, want: Expected) {
  return (
    found.line === want.line &&
    found.category === want.category &&
    found.message.includes(want.text)
  );
}

/** The files of the repository an override's `includes` names, one by one or by a glob. */
function coveredFiles(override: Override): string[] {
  return override.includes.flatMap((glob) => [
    ...new Bun.Glob(glob.endsWith("/**") ? `${glob}/*.ts` : glob).scanSync({ cwd: REPO }),
  ]);
}
