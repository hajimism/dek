import { existsSync, lstatSync, readFileSync } from "node:fs";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { loadConfig } from "./config.ts";
import { DekError } from "./error.ts";
import { parseRefSource, type RefSource } from "./ref-name.ts";
import { listSlides, resolveProject } from "./resolve.ts";
import { outputDir } from "./safe-fs.ts";

export {
  isPinnedRev,
  isPlainRefName,
  isRefName,
  parseRefSource,
  REF_HINT,
  type RefSource,
} from "./ref-name.ts";

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
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
  const { owner, repo, deck } = parseRefSource(name);
  return join(root, "refs", owner, repo, deck);
}

/** The marker of a snapshot, or nothing when it is missing or not one dek wrote. */
export function readRefMeta(dir: string): RefMeta | undefined {
  const path = join(dir, REF_MARKER);
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const parsed = RefMeta.safeParse(JSON.parse(readFileSync(path, "utf8")));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

const LICENSE_NAMES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"];

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
    fetched: pinned !== undefined && readRefMeta(dir)?.rev === pinned,
  };
}

/** A repository's files by path, without the tarball's top directory. */
export type RepoFiles = Map<string, Blob>;

/** Beyond this, a snapshot is refused: a deck to read is a few hundred kilobytes. */
export const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024;

/**
 * Reads a GitHub tarball. Bun leaves out links; a path that is absolute, has
 * an empty segment, or climbs with `..` is dropped here, so nothing written
 * later can land outside the snapshot.
 */
export async function readTarball(bytes: Uint8Array): Promise<RepoFiles> {
  const files: RepoFiles = new Map();
  for (const [path, blob] of await new Bun.Archive(bytes).files()) {
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

const DECK_SCRIPT_RE = /^(?:(.*)\/)?decks\/([^/]+)\/script\.md$/;

/** The decks in a repository: each `decks/<name>/script.md` beside its project's dek.toml. */
function repoDecks(files: RepoFiles): Array<{ name: string; prefix: string }> {
  return [...files.keys()].flatMap((path) => {
    const match = path.match(DECK_SCRIPT_RE);
    const prefix = match?.[1] ? `${match[1]}/` : "";
    return match?.[2] && files.has(`${prefix}dek.toml`) ? [{ name: match[2], prefix }] : [];
  });
}

/** The directory of the project that holds the deck, as a prefix: "" or "sample/". */
export function findDeckInRepo(files: RepoFiles, source: RefSource): string {
  const repo = `${source.owner}/${source.repo}`;
  const decks = repoDecks(files);
  const matches = decks.filter(
    (deck) =>
      deck.name === source.deck &&
      (source.path === undefined || `${deck.prefix}decks/${deck.name}` === source.path),
  );
  const [match, ...others] = matches;
  if (!match) {
    const names = [...new Set(decks.map((deck) => deck.name))].sort();
    throw new DekError(`${repo} has no deck "${source.deck}"`, {
      hint:
        names.length > 0
          ? `decks in ${repo}: ${names.join(", ")}`
          : `${repo} holds no dek project (decks/<name>/script.md beside a dek.toml)`,
    });
  }
  if (others.length > 0) {
    const paths = matches.map((deck) => `${deck.prefix}decks/${deck.name}`).sort();
    throw new DekError(`${repo} has more than one deck named "${source.deck}"`, {
      hint: `pass the GitHub link to the one you mean; they are at ${paths.join(", ")}`,
    });
  }
  return match.prefix;
}

/** Inside the deck, only what reading it needs: not dist/, .cache/, or voice/. */
function keepsInDeck(path: string): boolean {
  return (
    path === "script.md" ||
    path === "theme.css" ||
    path.startsWith("slides/") ||
    path.startsWith("assets/")
  );
}

/**
 * Writes the snapshot of one deck at one commit under refs/, laid out as the
 * project it came from so it resolves like any dek project. It is written
 * beside the old one and swapped in, so a failure leaves the old one whole.
 */
export async function installSnapshot(
  root: string,
  source: RefSource,
  sha: string,
  files: RepoFiles,
): Promise<{ dir: string; license: string | null; path: string }> {
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

  // refs/ is dek's; a link on the way would aim the swap below, and its delete, elsewhere.
  const refsDir = join(root, "refs");
  const dir = refDir(root, source.name);
  outputDir(dirname(dir), root);
  if (isLink(dir)) {
    await rm(dir);
  }
  const suffix = `${process.pid}-${Date.now().toString(36)}`;
  const temp = join(refsDir, `.tmp-${suffix}`);
  const old = join(refsDir, `.old-${suffix}`);
  const meta: RefMeta = { name: source.name, rev: sha, path: `${prefix}decks/${source.deck}` };
  try {
    for (const [path, blob] of picked) {
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
  return { dir, license: license ?? null, path: meta.path };
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
