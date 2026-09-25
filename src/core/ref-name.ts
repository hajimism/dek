import { DekError } from "./error.ts";

/**
 * A ref is someone else's deck, kept as a read-only snapshot to read as a
 * model. dek.toml `[refs]` pins each one to a commit; the snapshot under
 * `refs/owner/repo/deck` is only a copy of that commit and can be fetched again.
 * This module only names refs; `ref.ts` fetches and stores them.
 */
export type RefSource = {
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

const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]+$/;
const DECK_RE = /^[^/\\\s@]+$/;
const SHA_RE = /^[0-9a-f]{40}$/;

export const REF_HINT =
  "name a ref as owner/repo/deck, e.g. hajimism/dek/why-dek or hajimism/dek/why-dek@v1";

/** True for `owner/repo/deck[@rev]` or a GitHub link, which a deck name never is. */
export function isRefName(arg: string): boolean {
  if (/^https?:\/\/(www\.)?github\.com\//i.test(arg)) {
    return true;
  }
  if (arg.startsWith(".") || arg.startsWith("/") || arg.startsWith("~")) {
    return false;
  }
  return arg.split("@")[0]?.split("/").length === 3;
}

/** A valid `owner/repo/deck` with no rev: the form dek.toml `[refs]` keys take. */
export function isPlainRefName(name: string): boolean {
  try {
    const source = parseRefSource(name);
    return source.rev === undefined && source.name === name;
  } catch {
    return false;
  }
}

export function isPinnedRev(rev: string): boolean {
  return SHA_RE.test(rev);
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
  const valid =
    extra.length === 0 &&
    owner !== undefined &&
    OWNER_RE.test(owner) &&
    repo !== undefined &&
    REPO_RE.test(repo) &&
    repo !== "." &&
    repo !== ".." &&
    deck !== undefined &&
    DECK_RE.test(deck) &&
    deck !== "." &&
    deck !== ".." &&
    (rev === undefined || /^[^\s@]+$/.test(rev));
  if (!valid) {
    throw new DekError(`"${input}" is not a ref name`, { hint: REF_HINT });
  }
  return {
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
function parseGithubUrl(input: string): RefSource {
  const url = new URL(input);
  const [owner = "", repo = "", kind, rev, ...rest] = url.pathname.split("/").filter(Boolean);
  const decks = rest.indexOf("decks");
  const deck = decks === -1 ? undefined : rest[decks + 1];
  if (
    url.hostname !== "github.com" ||
    (kind !== "tree" && kind !== "blob") ||
    !rev ||
    deck === undefined
  ) {
    throw new DekError(`"${input}" is not a link to a deck on GitHub`, {
      hint: "link to the deck's folder, e.g. https://github.com/hajimism/dek/tree/main/sample/decks/why-dek, or name it as owner/repo/deck",
    });
  }
  const source = parseRefSource(`${owner}/${repo.replace(/\.git$/, "")}/${deck}@${rev}`);
  return { ...source, path: rest.slice(0, decks + 2).join("/") };
}
