/**
 * Write `docs/public/llms.txt` from the docs pages, the rule table, and the commands:
 *
 *   bun run llms
 *
 * A test fails while the committed file differs from what scripts/llms-text.ts builds.
 */
import { join } from "node:path";
import { LLMS_PATH, llmsText } from "./llms-text.ts";

await Bun.write(join(import.meta.dir, "..", LLMS_PATH), llmsText());
