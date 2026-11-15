/**
 * Which of CI's checks a pull request needs: dek's own (its tests, the docs and the package) and
 * dek.pub's (apps/pub's checks and its round trip), from the files it changes.
 *
 * dek.pub's round trip builds a sample deck with this checkout's `dekc` and publishes it, so a
 * change to `src/` or `sample/` needs both. A file this does not know needs both, another app
 * under `apps/` included. A push to main
 * always needs both, so what one check let through, the next run on main catches.
 *
 * In CI: `bun scripts/ci-scope.ts` writes `root` and `pub` to $GITHUB_OUTPUT. On a pull request,
 * actions/checkout checks out the merge commit, whose first parent is the base branch as it is now,
 * so it needs a checkout with `fetch-depth: 2`.
 */
import { appendFileSync } from "node:fs";

type Scope = { root: boolean; pub: boolean };

/** dek's alone: what dek.pub neither builds nor reads. */
const ROOT_ONLY = [
  /^docs\//,
  /^adr\//,
  /^tests\//,
  /^skills\//,
  /^(README|README\.ja|CONTRIBUTING|CHANGELOG|AGENTS|CLAUDE)\.md$/,
];

function scopeOfFile(file: string): Scope {
  if (file.startsWith("apps/pub/")) {
    return { root: false, pub: true };
  }
  if (ROOT_ONLY.some((pattern) => pattern.test(file))) {
    return { root: true, pub: false };
  }
  return { root: true, pub: true };
}

/** The checks `files` need, together; both when there are none to go by. */
export function scopeOf(files: readonly string[]): Scope {
  if (files.length === 0) {
    return { root: true, pub: true };
  }
  const scopes = files.map(scopeOfFile);
  return {
    root: scopes.some((scope) => scope.root),
    pub: scopes.some((scope) => scope.pub),
  };
}

/**
 * The files the merge commit checked out in `dir` changes from its base: a file moved is named
 * where it was and where it went, since leaving a directory reaches what read it there.
 */
export function changedFiles(dir = "."): string[] {
  const diff = Bun.spawnSync(["git", "diff", "--name-only", "--no-renames", "HEAD^1", "HEAD"], {
    cwd: dir,
  });
  if (diff.exitCode !== 0) {
    throw new Error(`git diff failed: ${diff.stderr.toString().trim()}`);
  }
  return diff.stdout.toString().split("\n").filter(Boolean);
}

if (import.meta.main) {
  const pullRequest = process.env.GITHUB_EVENT_NAME === "pull_request";
  const scope = pullRequest ? scopeOf(changedFiles()) : { root: true, pub: true };
  const lines = [`root=${scope.root}`, `pub=${scope.pub}`];
  console.log(`${pullRequest ? "pull request" : "not a pull request"}: ${lines.join(" ")}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  }
}
