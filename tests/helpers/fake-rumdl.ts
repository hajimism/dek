#!/usr/bin/env bun
const args = Bun.argv.slice(2);
if (args.includes("--fix")) {
  const marker = process.env.RUMDL_FIX_MARKER;
  if (marker) {
    await Bun.write(marker, "fix");
  }
}

const output =
  process.env.RUMDL_SARIF ??
  JSON.stringify({
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: { driver: { name: "rumdl" } },
        results: [{ ruleId: "MD013", message: { text: "line too long" } }],
      },
    ],
  });

process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
process.exit(Number(process.env.RUMDL_EXIT ?? 1));
