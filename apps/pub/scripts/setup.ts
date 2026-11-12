// Gets a fresh checkout of apps/pub ready for `bun run dev`: writes .env from dev.env when there
// is none, and generates Void's types. Run from apps/pub: `bun run setup`.

import { existsSync } from "node:fs";
import { join } from "node:path";

const here = join(import.meta.dir, "..");
const env = join(here, ".env");

if (existsSync(env)) {
  console.log(".env is there; leaving it as it is");
} else {
  await Bun.write(env, await Bun.file(join(here, "dev.env")).text());
  console.log("wrote .env from dev.env");
}

const prepare = Bun.spawnSync(["node_modules/.bin/void", "prepare"], { cwd: here, stdio: ["ignore", "inherit", "inherit"] });
if (prepare.exitCode !== 0) {
  process.exit(prepare.exitCode ?? 1);
}
console.log("ready: bun run dev, then open http://localhost:5173");
