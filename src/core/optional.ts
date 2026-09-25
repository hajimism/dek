import { existsSync } from "node:fs";
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

export function resolveBinFromAncestors(name: string, startDir: string): string | undefined {
  return walkUp(startDir, (dir) => {
    const bin = join(dir, "node_modules", ".bin", name);
    return existsSync(bin) ? bin : undefined;
  });
}
