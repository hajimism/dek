import { existsSync } from "node:fs";
import { join } from "node:path";
import { lintProblems, type Scenario } from "../scenario.ts";

/**
 * An empty folder: no dek.toml, no deck. What this measures is whether the agent finds
 * `dekc init` from what `dekc` says in a folder that is no project ("not a dek project"). It does
 * not measure the npm-name trap: the shim logs only `dekc` and `bunx dekc`, so an agent that runs
 * `bunx dek` or `bunx @hajimism/dek` goes unseen, and the default agent is not allowed either.
 */
export default {
  id: "start-from-nothing",
  prompt:
    "Set up a dek project in this folder for my talks, with one deck called lt, so I can start writing the script.",
  async setup() {},
  async check(project) {
    const found: string[] = [];
    if (!existsSync(join(project.dir, "dek.toml"))) {
      found.push("there is no dek.toml");
    }
    if (!existsSync(join(project.dir, "decks/lt/script.md"))) {
      found.push("there is no decks/lt/script.md");
    }
    return [...found, ...(await lintProblems(project))];
  },
  solution: ["dekc lint", "dekc init . --deck lt"],
} satisfies Scenario;
