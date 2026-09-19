import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";

export function walkUp<T>(startDir: string, visit: (dir: string) => T | undefined): T | undefined {
  let dir = resolve(startDir);
  while (true) {
    const hit = visit(dir);
    if (hit !== undefined) {
      return hit;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

export function resolvePackageFromAncestors(name: string, startDir: string): string | undefined {
  return walkUp(startDir, (dir) => {
    const pkgJson = join(dir, "node_modules", name, "package.json");
    if (!existsSync(pkgJson)) {
      return undefined;
    }
    try {
      return createRequire(pkgJson).resolve(name);
    } catch {
      return undefined;
    }
  });
}

export function resolveBinFromAncestors(name: string, startDir: string): string | undefined {
  return walkUp(startDir, (dir) => {
    const bin = join(dir, "node_modules", ".bin", name);
    return existsSync(bin) ? bin : undefined;
  });
}
