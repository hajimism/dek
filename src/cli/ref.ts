import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig } from "../core/config.ts";
import { DekError } from "../core/error.ts";
import { downloadTarball, resolveRev } from "../core/github.ts";
import {
  installSnapshot,
  isPinnedRev,
  parseRefSource,
  type RefSource,
  readTarball,
  refLicense,
  refState,
  refTitle,
} from "../core/ref.ts";
import { readTextIfExists } from "../core/resolve.ts";
import { readSourceIfExists, removeInside, writeInside } from "../core/safe-fs.ts";
import { writeAgentsMd } from "../core/sync.ts";
import { setTableKey } from "../core/toml-keys.ts";
import { requireProject } from "./scope.ts";

export type RefAddResult = {
  action: "add";
  name: string;
  rev: string;
  /** The rev it was pinned to before, when this moved the pin. */
  from?: string;
  /** False when the pin and the snapshot were already at `rev`. */
  changed: boolean;
  dir: string;
  license: string | null;
  warnings: string[];
};

export type RefListResult = {
  action: "list";
  refs: Array<{ name: string; rev: string; fetched: boolean; title?: string; slides?: number }>;
};

export type RefRmResult = { action: "rm"; name: string };

export type RefCliResult = RefAddResult | RefListResult | RefRmResult;

/**
 * `dek ref` lists, `dek ref <source>` pins and fetches (or moves the pin to
 * the latest, or to the rev after `@`), `dek ref rm <name>` drops one.
 */
export async function refCommand(options: { cwd: string; args: string[] }): Promise<RefCliResult> {
  const [first, second] = options.args;
  if (first === undefined) {
    return listRefs(options.cwd);
  }
  if (first === "rm") {
    if (second === undefined) {
      throw new DekError("usage: dek ref rm <owner/repo/deck>", {
        hint: "run `dek ref` to list refs",
      });
    }
    return removeRef(options.cwd, second);
  }
  return addRef(options.cwd, first);
}

/**
 * Fetches a pinned ref whose snapshot is missing or at another commit, so
 * clearing refs/ or cloning the project never loses one. A ref that is not
 * pinned is left for the read to explain.
 */
export async function restoreRef(cwd: string, arg: string): Promise<void> {
  const source = parseRefSource(arg);
  const project = requireProject(cwd);
  const { pinned, fetched } = refState(project, source.name);
  if (pinned === undefined || fetched) {
    return;
  }
  await fetchSnapshot(project.root, source, pinned);
}

async function fetchSnapshot(root: string, source: RefSource, sha: string) {
  const files = await readTarball(await downloadTarball(source.owner, source.repo, sha));
  return installSnapshot(root, source, sha, files);
}

async function addRef(cwd: string, arg: string): Promise<RefAddResult> {
  const source = parseRefSource(arg);
  const project = requireProject(cwd);
  const { pinned: from, dir, fetched } = refState(project, source.name);
  const rev =
    source.rev !== undefined && isPinnedRev(source.rev)
      ? source.rev
      : await resolveRev(source.owner, source.repo, source.rev);

  let changed = false;
  // The snapshot matches only when it is at `rev`; "fetched" says it is at the old pin.
  if (!(fetched && from === rev)) {
    await fetchSnapshot(project.root, source, rev);
    changed = true;
  }
  if (from !== rev) {
    const toml = readTextIfExists(project.configPath) ?? "";
    writeInside(project.configPath, setTableKey(toml, "refs", source.name, rev), project.root);
    changed = true;
  }
  ignoreRefs(project.root);
  writeAgentsMd(project.root);

  const license = refLicense(dir);
  return {
    action: "add",
    name: source.name,
    rev,
    ...(from !== undefined && from !== rev ? { from } : {}),
    changed,
    dir,
    license,
    warnings:
      license === null
        ? [
            `${source.owner}/${source.repo} has no license; read it as a model, but ask its author before reusing its text or assets`,
          ]
        : [],
  };
}

function listRefs(cwd: string): RefListResult {
  const project = requireProject(cwd);
  const refs = Object.keys(loadConfig(project.configPath).refs ?? {}).map((name) => {
    const { pinned: rev = "", dir, fetched } = refState(project, name);
    const summary = fetched ? refTitle(dir, parseRefSource(name).deck) : undefined;
    return { name, rev, fetched, ...summary };
  });
  return { action: "list", refs };
}

function removeRef(cwd: string, arg: string): RefRmResult {
  const source = parseRefSource(arg);
  const project = requireProject(cwd);
  const { pinned, dir } = refState(project, source.name);
  if (pinned === undefined && !existsSync(dir)) {
    throw new DekError(`ref "${source.name}" is not added`, {
      path: project.configPath,
      hint: "run `dek ref` to list refs",
    });
  }
  if (pinned !== undefined) {
    const toml = readFileSync(project.configPath, "utf8");
    writeInside(
      project.configPath,
      setTableKey(toml, "refs", source.name, undefined),
      project.root,
    );
  }
  removeInside(dir, project.root, { recursive: true });
  removeEmptyParents(dirname(dir), project.root);
  writeAgentsMd(project.root);
  return { action: "rm", name: source.name };
}

/** refs/owner/repo, refs/owner, and refs itself, while each is left empty. */
function removeEmptyParents(dir: string, root: string): void {
  let current = dir;
  while (
    current.startsWith(join(root, "refs")) &&
    existsSync(current) &&
    !lstatSync(current).isSymbolicLink()
  ) {
    if (readdirSync(current).length > 0) {
      return;
    }
    rmdirSync(current);
    current = dirname(current);
  }
}

/** Snapshots are fetched again from dek.toml, so git never needs them. */
function ignoreRefs(root: string): void {
  const path = join(root, ".gitignore");
  const current = readSourceIfExists(path, root) ?? "";
  if (/^\/?refs\/?$/m.test(current)) {
    return;
  }
  const separator = current === "" || current.endsWith("\n") ? "" : "\n";
  writeInside(path, `${current}${separator}refs/\n`, root);
}
