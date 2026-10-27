import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: mkdir, writeFile, rename, and rm, which write a snapshot into a fresh folder in refs/, which outputDir checked, and swap it in whole.
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import { loadConfig } from "./config.ts";
import { DekError } from "./error.ts";
import { shellQuote } from "./escape.ts";
import { foreignList } from "./foreign-text.ts";
import {
  isPlainRefName,
  isRefDeckName,
  packFile,
  parseRefSource,
  REF_DECK_NAME_RULE,
  type RefSource,
} from "./ref-name.ts";
import { listSlides, type Project, resolveProject } from "./resolve.ts";
import { followInside, outputDir } from "./safe-fs.ts";
import { readTar } from "./tar.ts";

export {
  isPinnedRev,
  isRefName,
  packFile,
  parseRefSource,
  type RefSource,
} from "./ref-name.ts";

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/** The first link on the way from `<root>/<top>` down to `path`, both included, if any. */
function linkUnder(root: string, top: "refs" | "packs", path: string): string | undefined {
  let at = join(root, top);
  for (const segment of ["", ...relative(at, path).split(sep)]) {
    at = join(at, segment);
    if (isLink(at)) {
      return at;
    }
  }
  return undefined;
}

/**
 * Refuses a link on the way to the snapshot at `dir`. refs/ is dek's own folder, which a cloned
 * project can still commit: a link there, even one that stays in the project, would aim a
 * snapshot's swap and its delete at what it points to, such as a deck under decks/.
 */
export function refuseLinkUnderRefs(root: string, dir: string): void {
  const link = linkUnder(root, "refs", dir);
  if (link !== undefined) {
    const rel = relative(root, link);
    throw new DekError(`${rel} is a symlink; dek follows no link under refs/`, {
      path: link,
      hint: `remove ${rel}: refs/ holds only the snapshots \`dekc ref\` writes, and the next read of a pinned ref fetches it again`,
    });
  }
}

/**
 * Refuses a link at packs/, or at the copy of `deck`'s pack kept there. dek writes and removes
 * that copy by name, so through a link it would overwrite, or delete, what the link points to.
 */
export function refuseLinkUnderPacks(root: string, deck: string): void {
  const link = linkUnder(root, "packs", join(root, packFile(deck)));
  if (link !== undefined) {
    const rel = relative(root, link);
    throw new DekError(`${rel} is a symlink; dek follows no link under packs/`, {
      path: link,
      hint: `remove ${rel}, then run \`dekc ref <file>.tgz\` with the pack you were sent: packs/ holds the copies it keeps, as plain files`,
    });
  }
}

/** Written into each snapshot; its presence is what makes a directory a ref. */
export const REF_MARKER = ".ref.json";

export const RefMeta = z.object({
  name: z.string(),
  rev: z.string(),
  /** The deck's directory inside the source repository. */
  path: z.string(),
});
export type RefMeta = z.infer<typeof RefMeta>;

export function refDir(root: string, name: string): string {
  const source = parseRefSource(name);
  return source.kind === "file"
    ? join(root, "refs", "file", source.deck)
    : join(root, "refs", source.owner, source.repo, source.deck);
}

/** The marker of a snapshot, or nothing when it is missing or not one dek wrote. */
export function readRefMeta(dir: string): RefMeta | undefined {
  const marker = join(dir, REF_MARKER);
  // dek writes the marker as a plain file; a link out of the snapshot is none of its.
  const path = existsSync(marker) ? followInside(marker, dir) : undefined;
  if (path === undefined) {
    return undefined;
  }
  try {
    const parsed = RefMeta.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The snapshot `dir` is in, and the ref it holds: the outermost folder from `dir` up that is one
 * dek wrote. A ref may carry a dek.toml, and a marker, of its own in its deck's assets; neither
 * hides the snapshot around them or names it. A marker anywhere else makes nothing a ref.
 */
function refAround(dir: string): { dir: string; name: string } | undefined {
  let found: { dir: string; name: string } | undefined;
  for (let at = resolve(dir); ; at = dirname(at)) {
    const name = snapshotName(at);
    if (name !== undefined) {
      found = { dir: at, name };
    }
    if (dirname(at) === at) {
      return found;
    }
  }
}

/**
 * The ref `dir` holds, when it is a snapshot as dek writes one: a dek.toml beside a marker that
 * names a ref, at that ref's own place under a project's refs/.
 */
export function snapshotName(dir: string): string | undefined {
  if (!isThere(join(dir, "dek.toml"))) {
    return undefined;
  }
  const name = readRefMeta(dir)?.name;
  if (name === undefined || !isPlainRefName(name)) {
    return undefined;
  }
  // The same folder, not the same spelling: a disk that ignores case, or a link at refs/, gives
  // the path to a snapshot another spelling than its name.
  const place = refDir("", name);
  const project = resolve(dir, ...place.split(sep).map(() => ".."));
  return isSameFolder(join(project, place), dir) ? name : undefined;
}

function isSameFolder(a: string, b: string): boolean {
  try {
    const [one, other] = [statSync(a), statSync(b)];
    return one.dev === other.dev && one.ino === other.ino;
  } catch {
    return false;
  }
}

function isThere(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Refuses `dir` when it is inside a ref: no command, the dev server's included, runs or writes there. */
export function refuseInsideRef(dir: string): void {
  const ref = refAround(dir);
  if (ref !== undefined) {
    throw new DekError("this directory is inside a ref; refs are read-only", {
      path: ref.dir,
      hint: `run dek from your own project instead: \`dekc show ${ref.name} <slug>\``,
    });
  }
}

/** The project around `cwd`, which is the user's own: never one inside a ref. */
export function requireProject(cwd: string): Project {
  const project = resolveProject(cwd);
  refuseInsideRef(project.root);
  return project;
}

/** What a command that writes says when it is handed a ref by name. */
export function refReadOnlyError(name: string): DekError {
  const ref = shellQuote(name);
  return new DekError(`"${name}" is a ref; refs are read-only`, {
    hint: `start a deck on its theme with \`dekc new <name> --theme-from ${ref}\`, or read it with \`dekc show ${ref} <slug>\` and write what you need in your own deck's theme`,
  });
}

export const LICENSE_NAMES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"];

/** The snapshot's license file, relative to the snapshot, when the source had one. */
export function refLicense(dir: string): string | null {
  return LICENSE_NAMES.find((name) => existsSync(join(dir, name))) ?? null;
}

/** What the project knows about one ref: its pin in dek.toml and whether the snapshot matches it. */
export type RefState = {
  name: string;
  /** The commit dek.toml pins, or nothing when the ref is not added. */
  pinned?: string;
  /** The snapshot directory, whether or not anything is there. */
  dir: string;
  /** True when the snapshot on disk is the pinned commit. */
  fetched: boolean;
};

export function refState(project: { root: string; configPath: string }, name: string): RefState {
  const pinned = loadConfig(project.configPath).refs?.[name];
  const dir = refDir(project.root, name);
  return {
    name,
    ...(pinned !== undefined ? { pinned } : {}),
    dir,
    // Never through a link under refs/: one is fetched again, which refuses the link.
    fetched:
      pinned !== undefined &&
      linkUnder(project.root, "refs", dir) === undefined &&
      readRefMeta(dir)?.rev === pinned,
  };
}

/** A repository's files by path, without the tarball's top directory. */
export type RepoFiles = Map<string, Blob>;

/** Beyond this, a snapshot is refused: a deck to read is a few hundred kilobytes. */
export const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;

/** A pack's tar, unzipped, may hold its files and their headers, not much more. */
const MAX_PACK_TAR_BYTES = 2 * MAX_SNAPSHOT_BYTES;

/**
 * A repository's tar, unzipped. A repository of text inflates some 3.5 times, so about five
 * times the 200 MB dek downloads of it: 1 GB.
 */
const MAX_TARBALL_TAR_BYTES = 1024 * 1024 * 1024;

/** A deck is a few hundred files; a pack of more is not one `dekc pack` made. */
const MAX_PACK_ENTRIES = 10_000;

/** A repository's files, folders, and the headers before them, as many as a large one holds. */
const MAX_TARBALL_ENTRIES = 200_000;

const PACK_HINT = "ask for a pack its author made with `dekc pack <deck>`";

/** Reads a GitHub tarball, as `readGzippedTar` reads any. */
export async function readTarball(
  bytes: Uint8Array,
  limits: { maxTarBytes?: number; maxEntries?: number } = {},
): Promise<RepoFiles> {
  const maxTarBytes = limits.maxTarBytes ?? MAX_TARBALL_TAR_BYTES;
  const maxEntries = limits.maxEntries ?? MAX_TARBALL_ENTRIES;
  return readGzippedTar(
    bytes,
    { maxTarBytes, maxEntries },
    {
      tooLarge: () =>
        new DekError(`the repository unpacks to more than ${formatMb(maxTarBytes)}`, {
          hint: "dekc ref downloads and unpacks the whole repository, so keep decks in a smaller repository, or ask the deck's author for a pack made with `dekc pack <deck>` and add it with `dekc ref <file>.tgz`",
        }),
      notTar: () =>
        new DekError("GitHub's tarball of the repository is not a gzipped tar", {
          hint: "run the command again",
        }),
      holds: (what) =>
        new DekError(`the repository's tarball holds ${what}, which dek does not read`, {
          hint: "the repository holds something dek cannot read; ask the deck's author for a pack made with `dekc pack <deck>` and pin the deck from it with `dekc ref <file>.tgz`",
        }),
    },
  );
}

/** Reads a pack from someone else, no larger than `maxBytes`, as `readGzippedTar` reads any. */
export async function readPack(
  bytes: Uint8Array,
  limits: { maxBytes?: number; maxTarBytes?: number; maxEntries?: number } = {},
): Promise<RepoFiles> {
  const maxBytes = limits.maxBytes ?? MAX_SNAPSHOT_BYTES;
  const maxTarBytes = limits.maxTarBytes ?? MAX_PACK_TAR_BYTES;
  const maxEntries = limits.maxEntries ?? MAX_PACK_ENTRIES;
  if (bytes.byteLength > maxBytes) {
    throw new DekError(`the pack is larger than ${formatMb(maxBytes)}`, { hint: PACK_HINT });
  }
  return readGzippedTar(
    bytes,
    { maxTarBytes, maxEntries },
    {
      tooLarge: () =>
        new DekError(`the pack unpacks to more than ${formatMb(maxTarBytes)}`, { hint: PACK_HINT }),
      notTar: () =>
        new DekError("the file is not a pack: a pack is a gzipped tar", { hint: PACK_HINT }),
      holds: (what) =>
        new DekError(`the pack holds ${what}, which dek does not read`, { hint: PACK_HINT }),
    },
  );
}

/**
 * The files of a gzipped tar from elsewhere. It is gunzipped through a count that stops at
 * `maxTarBytes`, so a small file that inflates without end is refused rather than held in
 * memory, and the tar is then read by dek's own reader (`readTar`), whose files are the bytes
 * the tar stores and no more. The top folder is dropped, and so is a path that is absolute, has
 * an empty segment, or climbs with `..`, so nothing written later can land outside the snapshot.
 */
async function readGzippedTar(
  bytes: Uint8Array,
  { maxTarBytes, maxEntries }: { maxTarBytes: number; maxEntries: number },
  errors: { tooLarge: () => DekError; notTar: () => DekError; holds: (what: string) => DekError },
): Promise<RepoFiles> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    const reader = new Blob([new Uint8Array(bytes)])
      .stream()
      .pipeThrough(new DecompressionStream("gzip"))
      .getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > maxTarBytes) {
        await reader.cancel();
        throw errors.tooLarge();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DekError) {
      throw error;
    }
    throw errors.notTar();
  }
  const tar = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    tar.set(chunk, offset);
    offset += chunk.byteLength;
  }
  // The tar holds them all now; let them go before its files are made.
  chunks.length = 0;
  const entries = readTar(tar, { maxBytes: maxTarBytes, maxEntries });
  if (!(entries instanceof Map)) {
    throw entries.kind === "too large"
      ? errors.tooLarge()
      : entries.kind === "not a tar"
        ? errors.notTar()
        : errors.holds(entries.what);
  }
  const files: RepoFiles = new Map();
  for (const [path, blob] of entries) {
    const [, ...segments] = path.split("/");
    const safe =
      segments.length > 0 &&
      !path.includes("\\") &&
      segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
    if (safe && !path.startsWith("/")) {
      files.set(segments.join("/"), blob);
    }
  }
  return files;
}

function formatMb(bytes: number): string {
  const mb = 1024 * 1024;
  if (bytes >= 1024 * mb && bytes % (1024 * mb) === 0) {
    return `${bytes / 1024 / mb} GB`;
  }
  return bytes >= mb ? `${bytes / mb} MB` : `${bytes} bytes`;
}

const DECK_SCRIPT_RE = /^(?:(.*)\/)?decks\/([^/]+)\/script\.md$/;

/** The decks in a repository: each `decks/<name>/script.md` beside its project's dek.toml. */
function repoDecks(files: RepoFiles): Array<{ name: string; prefix: string }> {
  return [...files.keys()].flatMap((path) => {
    const match = path.match(DECK_SCRIPT_RE);
    const prefix = match?.[1] ? `${match[1]}/` : "";
    return match?.[2] && files.has(`${prefix}dek.toml`) ? [{ name: match[2], prefix }] : [];
  });
}

/**
 * Names from someone else's repository or pack as a message lists them: those `shows` passes,
 * as foreignList shows them, then how many others there are, in the words of `others`.
 */
function listCarried(
  names: string[],
  shows: (name: string) => boolean,
  others: (count: number) => string,
): string {
  const shown = names.filter(shows);
  const left = names.length - shown.length;
  if (left === 0) {
    return foreignList(shown);
  }
  return shown.length === 0 ? others(left) : `${foreignList(shown)}, and ${others(left)}`;
}

/** Deck names as a message lists them: only those a ref can carry. */
function listDecks(names: string[]): string {
  return listCarried(
    names,
    isRefDeckName,
    (count) => `${count} whose ${count === 1 ? "name" : "names"} a ref cannot carry`,
  );
}

/**
 * The name of the one deck a pack holds; a pack of none, of more, or of one no ref can name is
 * refused. The names are the pack author's, so the message lists them as listDecks does, and the
 * hint is dek's.
 */
export function deckOfPack(files: RepoFiles): string {
  const names = [...new Set(repoDecks(files).map((deck) => deck.name))].sort();
  const [name, ...others] = names;
  if (name === undefined) {
    throw new DekError("the pack holds no deck", {
      hint: `a pack is one deck beside a dek.toml; ${PACK_HINT}`,
    });
  }
  if (others.length > 0) {
    throw new DekError(`the pack holds more than one deck: ${listDecks(names)}`, {
      hint: `a pack is one deck; ${PACK_HINT}`,
    });
  }
  if (!isRefDeckName(name)) {
    throw new DekError("the pack's deck has a name a ref cannot carry", {
      hint: `${REF_DECK_NAME_RULE}; ask its author to rename the deck's folder and pack it again`,
    });
  }
  return name;
}

/**
 * The directory of the project that holds the deck, as a prefix: "" or "sample/". The folder
 * names the source holds are its author's: an error lists them in its message, as foreignList
 * does, and its hint is dek's words alone.
 */
export function findDeckInRepo(files: RepoFiles, source: RefSource): string {
  const repo = source.kind === "file" ? "the pack" : `${source.owner}/${source.repo}`;
  const path = source.kind === "github" ? source.path : undefined;
  const decks = repoDecks(files);
  const matches = decks.filter(
    (deck) =>
      deck.name === source.deck &&
      (path === undefined || `${deck.prefix}decks/${deck.name}` === path),
  );
  const [match, ...others] = matches;
  if (!match) {
    const names = [...new Set(decks.map((deck) => deck.name))].sort();
    if (names.length === 0) {
      throw new DekError(`${repo} has no deck "${source.deck}"`, {
        hint: `${repo} holds no dek project (decks/<name>/script.md beside a dek.toml)`,
      });
    }
    throw new DekError(`${repo} has no deck "${source.deck}", only ${listDecks(names)}`, {
      hint:
        source.kind === "file"
          ? `add the pack you were sent with \`dekc ref <file>.tgz\`, which pins the deck it holds`
          : names.some(isRefDeckName)
            ? `pin one of them: \`dekc ref ${repo}/<deck>\``
            : `${REF_DECK_NAME_RULE}; ask its author to rename the deck's folder`,
    });
  }
  if (others.length > 0) {
    const paths = matches.map((deck) => `${deck.prefix}decks/${deck.name}`).sort();
    const listed = listCarried(
      paths,
      (path) => path.split("/").every(isRefDeckName),
      (count) => `${count} whose ${count === 1 ? "path" : "paths"} dek does not print`,
    );
    throw new DekError(`${repo} has more than one deck named "${source.deck}", at ${listed}`, {
      hint:
        source.kind === "file"
          ? `a pack is one deck; ${PACK_HINT}`
          : `pass the GitHub link to the folder of the one you mean, https://github.com/${repo}/tree/<rev>/<path>`,
    });
  }
  return match.prefix;
}

/** Inside the deck, only what reading it needs: not dist/, .cache/, or voice/. */
export function keepsInDeck(path: string): boolean {
  return (
    path === "script.md" ||
    path === "theme.css" ||
    path.startsWith("slides/") ||
    path.startsWith("assets/")
  );
}

/** The files a snapshot keeps, by their paths in it, and where the deck was in its source. */
export type Snapshot = {
  files: Map<string, Blob>;
  license: string | undefined;
  /** The deck's directory in the source repository or pack. */
  path: string;
};

/**
 * What a snapshot keeps of a repository or a pack: its project's dek.toml, the deck's files that
 * reading needs, and its license, laid out as the project it came from.
 */
export function pickSnapshot(files: RepoFiles, source: RefSource): Snapshot {
  const prefix = findDeckInRepo(files, source);
  const deckPrefix = `${prefix}decks/${source.deck}/`;
  const license =
    LICENSE_NAMES.find((name) => files.has(name)) ??
    LICENSE_NAMES.find((name) => files.has(`${prefix}${name}`));
  const picked = new Map<string, Blob>();
  picked.set("dek.toml", files.get(`${prefix}dek.toml`) ?? new Blob([]));
  for (const [path, blob] of files) {
    const inDeck = path.startsWith(deckPrefix) ? path.slice(deckPrefix.length) : undefined;
    if (inDeck !== undefined && keepsInDeck(inDeck)) {
      picked.set(`decks/${source.deck}/${inDeck}`, blob);
    }
  }
  if (license) {
    picked.set(license, files.get(license) ?? files.get(`${prefix}${license}`) ?? new Blob([]));
  }
  const size = [...picked.values()].reduce((sum, blob) => sum + blob.size, 0);
  if (size > MAX_SNAPSHOT_BYTES) {
    throw new DekError(`${source.name} is larger than ${MAX_SNAPSHOT_BYTES / 1024 / 1024} MB`, {
      hint: "a deck to read as a model should be far smaller; check its assets",
    });
  }
  return { files: picked, license, path: `${prefix}decks/${source.deck}` };
}

/**
 * What a pack's ref is pinned to: the sha256 of every file the snapshot keeps, in byte order of
 * their paths, each as its path, a NUL, its size in decimal digits, a NUL, and its bytes. It
 * follows the files, not the tarball, whose headers carry the time it was made.
 */
export async function snapshotDigest(snapshot: Snapshot): Promise<string> {
  const hasher = new Bun.CryptoHasher("sha256");
  const encoder = new TextEncoder();
  const paths = [...snapshot.files.keys()].sort((a, b) =>
    Buffer.compare(encoder.encode(a), encoder.encode(b)),
  );
  for (const path of paths) {
    const blob = snapshot.files.get(path) ?? new Blob([]);
    hasher.update(`${path}\0${blob.size}\0`);
    hasher.update(new Uint8Array(await blob.arrayBuffer()));
  }
  return hasher.digest("hex");
}

/** Writes the snapshot of one deck at one commit under refs/; see writeSnapshot. */
export async function installSnapshot(
  root: string,
  source: RefSource,
  sha: string,
  files: RepoFiles,
): Promise<{ dir: string; license: string | null; path: string }> {
  return writeSnapshot(root, source.name, sha, pickSnapshot(files, source));
}

/**
 * Writes a snapshot under refs/, laid out as the project it came from so it resolves like any
 * dek project, and marks it with what it is pinned to. It is written beside the old one and
 * swapped in, so a failure leaves the old one whole.
 */
export async function writeSnapshot(
  root: string,
  name: string,
  pin: string,
  snapshot: Snapshot,
): Promise<{ dir: string; license: string | null; path: string }> {
  const refsDir = join(root, "refs");
  const dir = refDir(root, name);
  // A link on the way would aim the swap below, and its delete, at what it points to.
  refuseLinkUnderRefs(root, dir);
  outputDir(dirname(dir), root);
  const suffix = `${process.pid}-${Date.now().toString(36)}`;
  const temp = join(refsDir, `.tmp-${suffix}`);
  const old = join(refsDir, `.old-${suffix}`);
  const meta: RefMeta = { name, rev: pin, path: snapshot.path };
  try {
    for (const [path, blob] of snapshot.files) {
      await mkdir(dirname(join(temp, path)), { recursive: true });
      await writeFile(join(temp, path), new Uint8Array(await blob.arrayBuffer()));
    }
    await writeFile(join(temp, REF_MARKER), `${JSON.stringify(meta, null, 2)}\n`);
    if (existsSync(dir)) {
      await rename(dir, old);
    }
    await rename(temp, dir);
  } catch (error) {
    if (!existsSync(dir) && existsSync(old)) {
      await rename(old, dir);
    }
    throw error;
  } finally {
    await rm(temp, { recursive: true, force: true });
    // Until the snapshot is back in place, `old` may be the only copy left.
    if (existsSync(dir)) {
      await rm(old, { recursive: true, force: true });
    }
  }
  return { dir, license: snapshot.license ?? null, path: meta.path };
}

/** The snapshot deck's title and slide count, or nothing when it does not parse. */
export function refTitle(dir: string, deck: string): { title: string; slides: number } | undefined {
  try {
    const found = resolveProject(dir).decks.find((entry) => entry.name === deck);
    return found ? { title: found.deck.title, slides: listSlides(found.dir).length } : undefined;
  } catch {
    return undefined;
  }
}
