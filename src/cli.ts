#!/usr/bin/env bun
import { main } from "./cli/main.ts";

await main(Bun.argv.slice(2), process.cwd());
