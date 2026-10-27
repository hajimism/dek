#!/usr/bin/env bun
// A worker that takes longer than a test's timeout, however loaded the machine, then answers
// like the fake one.
import { WAIT_MS } from "./wait.ts";

await new Response(Bun.stdin).text();
await Bun.sleep(WAIT_MS);
process.stdout.write(`${JSON.stringify({ overflows: [], contrasts: [] })}\n`);
