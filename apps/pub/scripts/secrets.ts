// Puts dek.pub's production secrets, kept encrypted in fnox.toml, on its two Workers: every one on
// the app's Worker with `void secret put`, and those that name the serve Worker as a push target
// with `fnox push` (ADR 86). Run from apps/pub with fnox's age key on hand: `bun run secrets`.

import { join } from "node:path";
import { appSecrets } from "./app-secrets.ts";

const here = join(import.meta.dir, "..");
const profile = "prod";

const exported = Bun.spawnSync(["fnox", "-P", profile, "export", "--format", "json"], {
  cwd: here,
  stdio: ["ignore", "pipe", "inherit"],
});
if (exported.exitCode !== 0) {
  process.exit(exported.exitCode ?? 1);
}
const secrets = appSecrets(exported.stdout.toString());

console.log(`fnox's ${profile} profile holds ${secrets.map(([name]) => name).join(", ")}`);
if (!confirm("Put each on the app's Worker with void secret put?")) {
  process.exit(1);
}
// Each value goes on stdin as fnox resolved it: `fnox get` would add a newline Void keeps.
for (const [name, value] of secrets) {
  const put = Bun.spawnSync(["node_modules/.bin/void", "secret", "put", name], {
    cwd: here,
    stdin: new TextEncoder().encode(value),
    stdout: "inherit",
    stderr: "inherit",
  });
  if (put.exitCode !== 0) {
    process.exit(put.exitCode ?? 1);
  }
}

// fnox push asks before it writes, and runs the wrangler the serve Worker depends on.
const push = Bun.spawnSync(["fnox", "-P", profile, "push"], {
  cwd: here,
  stdio: ["inherit", "inherit", "inherit"],
  env: { ...process.env, PATH: `${join(here, "serve/node_modules/.bin")}:${process.env.PATH}` },
});
process.exit(push.exitCode ?? 1);
