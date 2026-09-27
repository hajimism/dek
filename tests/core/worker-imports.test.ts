import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const src = join(import.meta.dir, "..", "..", "src");
const transpiler = new Bun.Transpiler({ loader: "ts" });

/** Every source file `entry` loads at run time; type-only imports load nothing. */
function runtimeImports(entry: string): string[] {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) {
      return;
    }
    seen.add(file);
    // The scanner reads a module, not a script: the shebang goes.
    const code = readFileSync(file, "utf8").replace(/^#!.*/, "");
    for (const { path } of transpiler.scanImports(code)) {
      if (path.startsWith(".")) {
        visit(resolve(dirname(file), path));
      }
    }
  };
  visit(join(src, entry));
  return [...seen].map((file) => relative(src, file)).sort();
}

// A worker starts once per run, before Chromium does; what it loads is on every shot's clock.
describe("worker imports", () => {
  test("the Playwright worker loads no deck rendering", () => {
    const loaded = runtimeImports("core/playwright-worker.ts");
    expect(loaded).toContain("core/playwright-visual.ts");
    for (const heavy of ["core/html.ts", "core/css.ts", "core/resolve.ts", "core/visual.ts"]) {
      expect(loaded).not.toContain(heavy);
    }
  });

  test("the video worker loads no deck rendering", () => {
    const loaded = runtimeImports("video/worker.ts");
    expect(loaded).toContain("core/capture-go.ts");
    for (const heavy of ["core/html.ts", "core/css.ts", "core/resolve.ts"]) {
      expect(loaded).not.toContain(heavy);
    }
  });
});
