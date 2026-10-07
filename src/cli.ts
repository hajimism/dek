#!/usr/bin/env -S bun --no-env-file --config=/dev/null
import { ignoreEnvFileVariables } from "./cli/env-file.ts";
import { main } from "./cli/main.ts";

// `bun ./node_modules/.bin/dekc` skips the line above and loads `.env` anyway. It reads
// `bunfig.toml` too, and nothing here can undo a preload that has already run.
ignoreEnvFileVariables(process.cwd());
await main(Bun.argv.slice(2), process.cwd());
