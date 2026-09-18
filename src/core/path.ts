import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export function moduleFilePath(url: string | URL): string {
  return fileURLToPath(url);
}

export function isInside(filePath: string, root: string): boolean {
  const rel = relative(resolve(root), resolve(filePath));
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

export function isDeckName(name: string): boolean {
  return (
    name.length > 0 && !name.includes("/") && !name.includes("\\") && name !== "." && name !== ".."
  );
}
