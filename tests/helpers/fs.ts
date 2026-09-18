import { realpathSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = realpathSync(await mkdtemp(join(tmpdir(), "dek-")));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
