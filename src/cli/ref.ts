import { existsSync, lstatSync, readdirSync, readFileSync, rmdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { loadConfig } from "../core/config.ts";
import { DekError } from "../core/error.ts";
import { isPlainWord, shellQuote } from "../core/escape.ts";
import { downloadTarball, resolveRev } from "../core/github.ts";
import {
  deckOfPack,
  installSnapshot,
  isPinnedRev,
  packFile,
  parseRefSource,
  pickSnapshot,
  readPack,
  readTarball,
  refDir,
  refLicense,
  refState,
  refTitle,
  refuseLinkUnderPacks,
  refuseLinkUnderRefs,
  type Snapshot,
  snapshotDigest,
  writeSnapshot,
} from "../core/ref.ts";
import type { FileRefSource, GithubRefSource, RefSource } from "../core/ref-name.ts";
import { readSourceIfExists, removeInside, requireInside, writeInside } from "../core/safe-fs.ts";
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
  /** A pack's ref: its committed copy, which a clone unpacks the ref from. */
  pack?: string;
  warnings: string[];
};

export type RefListResult = {
  action: "list";
  refs: Array<{ name: string; rev: string; fetched: boolean; title?: string; slides?: number }>;
};

export type RefRmResult = { action: "rm"; name: string };

export type RefCliResult = RefAddResult | RefListResult | RefRmResult;

/**
 * Fetches a pinned ref whose snapshot is missing or at another commit, so
 * clearing refs/ or cloning the project never loses one. A ref that is not
 * pinned is left for the read to explain.
 */
export async function restoreRef(cwd: string, arg: string): Promise<void> {
  const source = parseRefSource(arg);
  const project = requireProject(cwd);
  const { pinned, dir, fetched } = refState(project, source.name);
  if (pinned === undefined || fetched) {
    return;
  }
  // Said before a download that the write would refuse anyway.
  refuseLinkUnderRefs(project.root, dir);
  if (source.kind === "file") {
    await unpackSnapshot(project.root, source, pinned);
    return;
  }
  await fetchSnapshot(project.root, source, pinned);
}

async function fetchSnapshot(root: string, source: GithubRefSource, sha: string) {
  const files = await readTarball(await downloadTarball(source.owner, source.repo, sha));
  return installSnapshot(root, source, sha, files);
}

/** A pack's snapshot, unpacked again from its committed copy, which must be the pinned one. */
async function unpackSnapshot(root: string, source: FileRefSource, pin: string): Promise<void> {
  const rel = packFile(source.deck);
  const path = join(root, rel);
  if (!existsSync(path)) {
    throw new DekError(`${rel} is missing`, {
      path,
      hint: `a pack's ref is unpacked from its copy in packs/, so commit packs/ with dek.toml; run \`dekc ref <file>.tgz\` with the pack you were sent to add it again`,
    });
  }
  const snapshot = await readPackFile(path, source, root);
  if ((await snapshotDigest(snapshot)) !== pin) {
    throw new DekError(`${rel} is not the pack ${source.name} is pinned to`, {
      path,
      hint: `run \`dekc ref ${shellQuote(rel)}\` to pin the pack that is there, or put back the one dek.toml pins`,
    });
  }
  await writeSnapshot(root, source.name, pin, snapshot);
}

/** What a snapshot keeps of the pack at `path`; an error says which file it was about. */
async function readPackFile(
  path: string,
  source: FileRefSource | undefined,
  root?: string,
): Promise<Snapshot & { source: FileRefSource; bytes: Uint8Array }> {
  try {
    const bytes = readFileSync(root === undefined ? path : requireInside(path, root));
    const files = await readPack(bytes);
    const found = source ?? parseRefSource(`file/${deckOfPack(files)}`);
    if (found.kind !== "file") {
      throw new DekError("the pack's deck cannot be named as a ref");
    }
    return { ...pickSnapshot(files, found), source: found, bytes };
  } catch (error) {
    if (error instanceof DekError && error.path === undefined) {
      throw new DekError(error.message, { path, ...(error.hint ? { hint: error.hint } : {}) });
    }
    throw error;
  }
}

/** `dekc ref <source>`: pin and fetch, or move the pin to the latest or to the rev after `@`. */
export async function addRef(cwd: string, arg: string): Promise<RefAddResult> {
  if (isPackPath(arg)) {
    return addPack(cwd, arg);
  }
  const source = parseRefSource(arg);
  if (source.kind === "file") {
    throw new DekError(`"${arg}" names a pack's ref`, {
      hint: "add a pack by its file, `dekc ref <file>.tgz`; `dekc ref` lists the refs already added",
    });
  }
  const project = requireProject(cwd);
  refuseSharedFolders(project, source);
  const { pinned: from, dir, fetched } = refState(project, source.name);
  // Said before a download that the write would refuse anyway.
  refuseLinkUnderRefs(project.root, dir);
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
    const toml = readSourceIfExists(project.configPath, project.root) ?? "";
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

/**
 * Refuses a pin whose folders another pin, or a folder already on disk, takes. refs/ and packs/
 * are named by the ref, and macOS and Windows read a name without its case, so `file/Talk` and
 * `file/talk` would share one snapshot and one pack, and adding the second would replace the
 * first's.
 */
function refuseSharedFolders(
  project: { root: string; configPath: string },
  source: RefSource,
): void {
  const { name } = source;
  const other = Object.keys(loadConfig(project.configPath).refs ?? {}).find(
    (pinned) => pinned !== name && folded(pinned) === folded(name),
  );
  if (other !== undefined) {
    throw new DekError(`${name} would share its folders with ${other}, which dek.toml pins`, {
      path: project.configPath,
      hint: `a ref's folders are named without their case on macOS and Windows; to pin ${name} in its place, run \`dekc ref rm ${shellQuote(other)}\` first`,
    });
  }
  const paths = [relative(project.root, refDir(project.root, name))];
  if (source.kind === "file") {
    paths.push(packFile(source.deck));
  }
  const left = paths
    .map((path) => spelledOtherwise(project.root, path))
    .find((path) => path !== undefined);
  if (left !== undefined) {
    const shown = isPlainWord(left) ? left : "another folder";
    throw new DekError(
      `${name} would share a folder with ${shown}, which is already in the project`,
      {
        path: join(project.root, left),
        hint: "no ref in dek.toml pins it, so a ref removed by hand left it; delete it and add the ref again",
      },
    );
  }
}

/** A name as a file system blind to case and form reads it: APFS folds ς as σ, and ﬁ as fi. */
function folded(name: string): string {
  return name.normalize("NFKC").toUpperCase().toLowerCase();
}

/**
 * The path, under `root`, of a folder or file a file system blind to case and form would read as
 * `path` though it is spelled otherwise, found segment by segment.
 */
function spelledOtherwise(root: string, path: string): string | undefined {
  let dir = root;
  const walked: string[] = [];
  for (const segment of path.split(sep)) {
    const entries = existsSync(dir) && statSync(dir).isDirectory() ? readdirSync(dir) : [];
    const other = entries.find((entry) => entry !== segment && folded(entry) === folded(segment));
    if (other !== undefined) {
      return join(...walked, other);
    }
    if (!entries.includes(segment)) {
      return undefined;
    }
    walked.push(segment);
    dir = join(dir, segment);
  }
  return undefined;
}

/** An argument that ends in .tgz or .tar.gz is a pack's path, never a ref name. */
function isPackPath(arg: string): boolean {
  return /\.(tgz|tar\.gz)$/i.test(arg);
}

/**
 * `dekc ref <file>.tgz`: pin the pack's deck as `file/<deck>` to the digest of its files, keep
 * the pack as packs/<deck>.tgz for git, and unpack the snapshot. Everything is read and checked
 * before the first write.
 */
async function addPack(cwd: string, arg: string): Promise<RefAddResult> {
  const project = requireProject(cwd);
  const given = resolve(cwd, arg);
  if (!existsSync(given)) {
    throw new DekError(`no such file: ${arg}`, {
      path: given,
      hint: "pass the path of the .tgz `dekc pack` wrote",
    });
  }
  const read = await readPackFile(given, undefined);
  const { source, bytes } = read;
  refuseSharedFolders(project, source);
  const rev = await snapshotDigest(read);
  const { pinned: from, dir, fetched } = refState(project, source.name);
  const stored = join(project.root, packFile(source.deck));
  // Before the first write: the copy below is written by name.
  refuseLinkUnderPacks(project.root, source.deck);

  let changed = false;
  if (!(fetched && from === rev)) {
    await writeSnapshot(project.root, source.name, rev, read);
    changed = true;
  }
  if (!(await isPackOf(stored, source, rev, project.root))) {
    writeInside(stored, bytes, project.root);
    changed = true;
  }
  if (from !== rev) {
    const toml = readSourceIfExists(project.configPath, project.root) ?? "";
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
    pack: stored,
    warnings:
      license === null
        ? [
            "the pack has no license; read it as a model, but ask its author before reusing its text or assets",
          ]
        : [],
  };
}

/** True when the pack at `path` holds the files `rev` pins. */
async function isPackOf(
  path: string,
  source: FileRefSource,
  rev: string,
  root: string,
): Promise<boolean> {
  if (!existsSync(path)) {
    return false;
  }
  try {
    return (await snapshotDigest(await readPackFile(path, source, root))) === rev;
  } catch {
    return false;
  }
}

export function listRefs(cwd: string): RefListResult {
  const project = requireProject(cwd);
  const refs = Object.keys(loadConfig(project.configPath).refs ?? {}).map((name) => {
    const { pinned: rev = "", dir, fetched } = refState(project, name);
    const summary = fetched ? refTitle(dir, parseRefSource(name).deck) : undefined;
    return { name, rev, fetched, ...summary };
  });
  return { action: "list", refs };
}

export function removeRef(cwd: string, arg: string): RefRmResult {
  const source = parseRefSource(arg);
  const project = requireProject(cwd);
  const { pinned, dir } = refState(project, source.name);
  if (pinned === undefined && !existsSync(dir)) {
    throw new DekError(`ref "${source.name}" is not added`, {
      path: project.configPath,
      hint: "run `dekc ref` to list refs",
    });
  }
  // Before anything changes: the deletes below must not reach what a link there points to.
  refuseLinkUnderRefs(project.root, dir);
  if (source.kind === "file") {
    refuseLinkUnderPacks(project.root, source.deck);
  }
  if (pinned !== undefined) {
    const toml = readSourceIfExists(project.configPath, project.root) ?? "";
    writeInside(
      project.configPath,
      setTableKey(toml, "refs", source.name, undefined),
      project.root,
    );
  }
  removeInside(dir, project.root, { recursive: true });
  removeEmptyParents(dirname(dir), project.root);
  if (source.kind === "file") {
    const packs = join(project.root, "packs");
    removeInside(join(project.root, packFile(source.deck)), project.root);
    if (
      existsSync(packs) &&
      !lstatSync(packs).isSymbolicLink() &&
      readdirSync(packs).length === 0
    ) {
      rmdirSync(packs);
    }
  }
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
