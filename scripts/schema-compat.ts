/**
 * Fail while the `--json` contract narrows and no commit says so:
 *
 *   bun scripts/schema-compat.ts origin/main          # the working tree, since it left origin/main
 *   bun scripts/schema-compat.ts <base> <head>        # <head>, since it left <base>
 *
 * Compares docs/public/cli.schema.json where the branch left <base> with the working tree's, or
 * <head>'s, and prints each change that can break a consumer of the output by its JSON Pointer.
 * Exits 1 when there is one and no commit since then is marked breaking, as `feat!:` or with a
 * `BREAKING CHANGE:` footer; 2 when it cannot compare. ADR 30 says which changes count. It needs
 * git and Bun and nothing from node_modules, so CI runs it without installing dependencies: on a
 * pull request against its base, and on a push to main against main before it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Break,
  marksBreaking,
  SCHEMA_PATH,
  schemaBreaks,
  UncomparedKeyword,
} from "./schema-breaks.ts";

const HINT =
  'put "!" after the type of the commit that makes the change (feat!: or feat(scope)!:), or ' +
  'add a "BREAKING CHANGE: <what a consumer must change>" footer to it; or keep what the base ' +
  "promised";

/** On main, which cannot be rewritten, the mark has to come in a commit of its own. */
const MAIN_HINT =
  "merge a commit marked breaking (fix!: <what changed>, or a BREAKING CHANGE: footer) before " +
  "the release pull request, so release-please bumps the version for a breaking change";

/** Why the comparison cannot run, and what to do about it. */
class Stop extends Error {
  constructor(
    message: string,
    readonly hint: string,
  ) {
    super(message);
  }
}

function git(args: string[]): string {
  const run = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  if (run.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")}: ${run.stderr.toString().trim()}`);
  }
  return run.stdout.toString();
}

function parsed(text: string, where: string): object {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Stop(
      `${SCHEMA_PATH} ${where} is not JSON: ${error instanceof Error ? error.message : error}`,
      "write it again with `bun run schema`, and commit it",
    );
  }
}

function schemaAt(revision: string): object {
  let text: string;
  try {
    text = git(["show", `${revision}:${SCHEMA_PATH}`]);
  } catch {
    throw new Stop(
      `${revision.slice(0, 7)} has no ${SCHEMA_PATH}`,
      "compare with a commit made after `bun run schema` first wrote it",
    );
  }
  return parsed(text, `at ${revision.slice(0, 7)}`);
}

function workingTreeSchema(): object {
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  return parsed(readFileSync(join(root, SCHEMA_PATH), "utf8"), "in the working tree");
}

/** The first commit in `range` marked breaking, as its short sha and subject. */
function breakingCommit(range: string): string | undefined {
  const log = git(["log", "--no-merges", "--format=%h%x1f%B%x1e", range]);
  for (const entry of log.split("\x1e")) {
    const [sha = "", message = ""] = entry.trim().split("\x1f");
    if (marksBreaking(message)) {
      return `${sha} ${message.split("\n")[0]}`;
    }
  }
  return undefined;
}

function report(breaks: Break[], since: string): void {
  console.log(`--json narrows in ${breaks.length} place(s) since ${since}:`);
  const width = Math.max(...breaks.map((change) => change.path.length));
  for (const change of breaks) {
    console.log(`  ${change.path.padEnd(width)}  ${change.message}`);
  }
}

function main(argv: string[]): number {
  const [baseRef, headRef, ...extra] = argv;
  if (baseRef === undefined || baseRef.startsWith("-") || extra.length > 0) {
    console.error("usage: bun scripts/schema-compat.ts <base> [<head>]");
    console.error("hint: bun scripts/schema-compat.ts origin/main checks the working tree");
    return 2;
  }
  const fork = git(["merge-base", baseRef, headRef ?? "HEAD"]).trim();
  const since = fork.slice(0, 7);
  const head = headRef === undefined ? workingTreeSchema() : schemaAt(headRef);
  const breaks = schemaBreaks(schemaAt(fork), head);
  if (breaks.length === 0) {
    console.log(`--json keeps everything it promised at ${since}.`);
    return 0;
  }
  report(breaks, since);
  const actions = process.env.GITHUB_ACTIONS === "true";
  const onMain = process.env.GITHUB_EVENT_NAME === "push";
  const marked = breakingCommit(`${fork}..${headRef ?? "HEAD"}`);
  if (marked !== undefined) {
    console.log(`\nMarked breaking by ${marked}.`);
    // A squash merge writes one commit of its own, which keeps "!" only in its title.
    const squash =
      'A squash merge must carry the mark into the commit it makes: "!" in its title, or the ' +
      "footer in its body; Contract fails on main otherwise.";
    if (!onMain) {
      console.log(squash);
      if (actions) {
        console.log(`::warning title=Keep the breaking mark when squashing::${squash}`);
      }
    }
    return 0;
  }
  const hint = onMain ? MAIN_HINT : HINT;
  console.error(`\nerror: no commit since ${since} is marked breaking`);
  console.error(`hint: ${hint}`);
  if (actions) {
    console.log(
      `::error file=${SCHEMA_PATH},title=--json narrows without a breaking mark::` +
        `${breaks.length} change(s) can break a consumer of --json; the log lists them. ${hint}.`,
    );
  }
  return 1;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof UncomparedKeyword) {
    console.error(
      `hint: teach scripts/schema-breaks.ts what ${error.keyword} means for a reader of --json, ` +
        "with a test (ADR 30)",
    );
  } else if (error instanceof Stop) {
    console.error(`hint: ${error.hint}`);
  } else {
    console.error("hint: run it inside the repository, with <base> a commit git has fetched");
  }
  process.exitCode = 2;
}
