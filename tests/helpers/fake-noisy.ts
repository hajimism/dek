#!/usr/bin/env bun
import { writeSync } from "node:fs";

const chunk = Buffer.alloc(64 * 1024, 0x78);
for (let i = 0; i < 32; i++) {
  writeSync(2, chunk);
}
process.stdout.write("ok\n");
const last = Bun.argv.at(-1);
if (last?.endsWith(".mp4")) {
  await Bun.write(last, "ok");
}
process.exit(0);
