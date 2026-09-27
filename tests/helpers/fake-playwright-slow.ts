#!/usr/bin/env bun
// A worker that takes longer than a test's timeout, then answers like the fake one.
await new Response(Bun.stdin).text();
await Bun.sleep(80);
process.stdout.write(`${JSON.stringify({ overflows: [], contrasts: [] })}\n`);
