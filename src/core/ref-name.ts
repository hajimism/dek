import { DekError } from "./error.ts";
import { holdsHidden } from "./foreign-text.ts";

/**
 * A ref is someone else's deck, kept as a read-only snapshot to read as a
 * model. dek.toml `[refs]` pins each one: a deck on GitHub to a commit, a pack
 * to a digest of its files. The snapshot under `refs/` is only a copy of what
 * the pin names, fetched or unpacked again whenever it is missing.
 * This module only names refs; `ref.ts` fetches and stores them.
 */
export type GithubRefSource = {
  kind: "github";
  /** `owner/repo/deck`, the key in dek.toml `[refs]`. */
  name: string;
  owner: string;
  repo: string;
  deck: string;
  /** A tag, branch, or sha after `@`. */
  rev?: string;
  /** The deck's directory in the repository, known when a GitHub URL named it. */
  path?: string;
};

/** A deck handed over as a file by `dekc pack`, committed as `packs/<deck>.tgz`. */
export type FileRefSource = {
  kind: "file";
  /** `file/<deck>`, the key in dek.toml `[refs]`. */
  name: string;
  deck: string;
};

export type RefSource = GithubRefSource | FileRefSource;

/** The first segment of a pack's ref name; no GitHub owner may take it, so refs/ never overlaps. */
const PACK_OWNER = "file";

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]+$/;
/**
 * A ref's deck name: letters, marks, and digits of any script, dots, dashes, and underscores, not
 * first a dash. It is chosen by whoever made the pack or the repository, and dek prints it in the
 * commands it suggests and in AGENTS.md, inside a code span: no shell, code span, or command line
 * reads anything in it.
 */
const DECK_RE = /^[\p{L}\p{M}\p{N}._][\p{L}\p{M}\p{N}._-]{0,63}$/u;

/** Bytes a ref's deck name may take: its pack, `<deck>.tgz`, stays within a file name's 255. */
const DECK_MAX_BYTES = 200;
const SHA_RE = /^[0-9a-f]{40}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;

/** What a ref's deck name may hold, as a hint says it. */
export const REF_DECK_NAME_RULE =
  "a ref names its deck with up to 64 letters, digits, dots, dashes, and underscores, none a person cannot see, not first a dash, each accented letter one character (NFC)";

const REF_HINT = `name a ref as owner/repo/deck, e.g. hajimism/dek/why-dek or hajimism/dek/why-dek@v1, or a pack's as file/<deck>; ${REF_DECK_NAME_RULE}`;

/** Where a pack's ref keeps its pack, relative to the project root: committed, never ignored. */
export function packFile(deck: string): string {
  return `packs/${deck}.tgz`;
}

/** True for `owner/repo/deck[@rev]` or a GitHub link, which a deck name never is. */
export function isRefName(arg: string): boolean {
  if (/^https?:\/\/(www\.)?github\.com\//i.test(arg)) {
    return true;
  }
  if (arg.startsWith(".") || arg.startsWith("/") || arg.startsWith("~")) {
    return false;
  }
  const segments = arg.split("@")[0]?.split("/") ?? [];
  return segments.length === 3 || (segments.length === 2 && segments[0] === PACK_OWNER);
}

/** A valid `owner/repo/deck` with no rev, or a pack's `file/<deck>`: the form dek.toml `[refs]` keys take. */
export function isPlainRefName(name: string): boolean {
  try {
    const source = parseRefSource(name);
    return (source.kind === "file" || source.rev === undefined) && source.name === name;
  } catch {
    return false;
  }
}

export function isPinnedRev(rev: string): boolean {
  return SHA_RE.test(rev);
}

/** True when `pin` has the form a ref of this kind is pinned with: a commit, or a pack's digest. */
export function isPinFor(source: RefSource, pin: string): boolean {
  return source.kind === "file" ? DIGEST_RE.test(pin) : SHA_RE.test(pin);
}

/**
 * True for a deck name a ref can carry: see DECK_RE; not . or ..; composed (NFC), since a file
 * system that ignores the form would give two spellings of one name one folder; and with no
 * character a person cannot see. A pack's author chooses it, and dek prints it as the ref's name,
 * as in AGENTS.md.
 */
export function isRefDeckName(deck: string | undefined): deck is string {
  return (
    deck !== undefined &&
    DECK_RE.test(deck) &&
    deck === deck.normalize("NFC") &&
    Buffer.byteLength(deck) <= DECK_MAX_BYTES &&
    // DECK_RE takes no control character; a letter or a mark can still be one a person cannot see.
    !holdsHidden(deck) &&
    deck !== "." &&
    deck !== ".."
  );
}

export function parseRefSource(input: string): RefSource {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return parseGithubUrl(trimmed);
  }
  const at = trimmed.indexOf("@");
  const path = at === -1 ? trimmed : trimmed.slice(0, at);
  const rev = at === -1 ? undefined : trimmed.slice(at + 1);
  const [owner, repo, deck, ...extra] = path.split("/");
  if (owner === PACK_OWNER && deck === undefined) {
    if (rev !== undefined || !isRefDeckName(repo)) {
      throw new DekError(`"${input}" is not a ref name`, { hint: REF_HINT });
    }
    return { kind: "file", name: `${PACK_OWNER}/${repo}`, deck: repo };
  }
  if (owner?.toLowerCase() === PACK_OWNER && deck !== undefined) {
    throw new DekError(`"${input}" is not a ref name`, {
      hint: "file is kept for packs, so no GitHub owner of that name can be pinned; name a pack's ref as file/<deck>",
    });
  }
  const valid =
    extra.length === 0 &&
    owner !== undefined &&
    OWNER_RE.test(owner) &&
    repo !== undefined &&
    REPO_RE.test(repo) &&
    repo !== "." &&
    repo !== ".." &&
    isRefDeckName(deck) &&
    (rev === undefined || /^[^\s@]+$/.test(rev));
  if (!valid) {
    throw new DekError(`"${input}" is not a ref name`, { hint: REF_HINT });
  }
  return {
    kind: "github",
    name: `${owner}/${repo}/${deck}`,
    owner,
    repo,
    deck,
    ...(rev !== undefined ? { rev } : {}),
  };
}

/**
 * `https://github.com/owner/repo/tree/<rev>/<path>/decks/<deck>[/...]`, the
 * link people copy from a browser. A branch name with a slash cannot be told
 * apart from the path, so such a branch goes after `@` instead.
 */
function parseGithubUrl(input: string): GithubRefSource {
  const url = new URL(input);
  const [owner = "", repo = "", kind, rev, ...encoded] = url.pathname.split("/").filter(Boolean);
  // The folders after the rev as the repository names them; GitHub's link encodes any but ASCII.
  const rest = decodeSegments(encoded);
  const decks = rest?.indexOf("decks") ?? -1;
  const deck = decks === -1 ? undefined : rest?.[decks + 1];
  if (
    url.hostname !== "github.com" ||
    (kind !== "tree" && kind !== "blob") ||
    !rev ||
    rest === undefined ||
    deck === undefined
  ) {
    throw new DekError(`"${input}" is not a link to a deck on GitHub`, {
      hint: "link to the deck's folder, e.g. https://github.com/hajimism/dek/tree/main/sample/decks/why-dek, or name it as owner/repo/deck",
    });
  }
  if (!isRefDeckName(deck)) {
    throw new DekError(`"${input}" is not a link to a deck a ref can name`, {
      hint: REF_DECK_NAME_RULE,
    });
  }
  const source = parseRefSource(`${owner}/${repo.replace(/\.git$/, "")}/${deck}@${rev}`);
  if (source.kind !== "github") {
    throw new DekError(`"${input}" is not a link to a deck on GitHub`, { hint: REF_HINT });
  }
  return { ...source, path: rest.slice(0, decks + 2).join("/") };
}

/** Each segment of a link's path decoded, or nothing when one is not valid percent-encoding. */
function decodeSegments(segments: string[]): string[] | undefined {
  try {
    return segments.map((segment) => decodeURIComponent(segment));
  } catch {
    return undefined;
  }
}
