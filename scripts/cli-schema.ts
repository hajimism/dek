/**
 * Write the `--json` contract as the JSON Schema the docs site publishes:
 *
 *   bun run schema
 *
 * A test fails while the committed file differs from what src/cli/contract.ts states.
 */
import { join } from "node:path";
import { CLI_SCHEMA_PATH, cliJsonSchema } from "../src/cli/contract.ts";

await Bun.write(
  join(import.meta.dir, "..", CLI_SCHEMA_PATH),
  `${JSON.stringify(cliJsonSchema(), null, 2)}\n`,
);
