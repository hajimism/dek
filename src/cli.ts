#!/usr/bin/env -S bun --no-env-file
import { ignoreEnvFileVariables } from "./cli/env-file.ts";
import { main } from "./cli/main.ts";

// `bun ./node_modules/.bin/dekc` skips the line above and loads `.env` anyway.
ignoreEnvFileVariables(process.cwd());
await main(Bun.argv.slice(2), process.cwd());
