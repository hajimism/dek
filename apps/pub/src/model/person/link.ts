// The links a person's profile shows, in the order they put them (ADR 78): what a link may be,
// and how the profile names it. Plain functions, so the settings page checks a link as it is
// typed by the same rules the API saves it by.

import type { Account } from "./type.ts";

/** How many links a profile shows. */
export const MAX_LINKS = 5;

/** The longest link, as the URL parser writes it out. */
export const MAX_LINK_LENGTH = 500;

/** What keeps a string from being a link: no address of a named host, not https, a user name or password in it, or too long. */
export type LinkProblem = "invalid" | "not_https" | "credentials" | "too_long";

/** What keeps a list from being saved: one of its links, the same link twice, or more than `MAX_LINKS`. */
export type LinksProblem = LinkProblem | "duplicate" | "too_many";

/** A scheme at the start, `mailto:` or `http:`; not a host and its port, as in `example.com:8443`. */
const SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/**
 * `input` as a link: trimmed, taken as https when it names no scheme, and written out as the URL
 * parser writes it, host lowercased and default port dropped, so one address is one string.
 */
export function readLink(
  input: string,
): { ok: true; url: string } | { ok: false; problem: LinkProblem } {
  const typed = input.trim();
  let url: URL;
  try {
    url = new URL(SCHEME.test(typed) ? typed : `https://${typed}`);
  } catch {
    return { ok: false, problem: "invalid" };
  }
  if (url.protocol !== "https:") {
    return { ok: false, problem: "not_https" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, problem: "credentials" };
  }
  const host = url.hostname;
  if (!host.includes(".") || host.startsWith(".") || host.endsWith(".")) {
    return { ok: false, problem: "invalid" };
  }
  if (url.href.length > MAX_LINK_LENGTH) {
    return { ok: false, problem: "too_long" };
  }
  return { ok: true, url: url.href };
}

/** Each of `inputs` as a link, in order; or the first problem, with the index of the link it is in. */
export function readLinks(
  inputs: readonly string[],
): { ok: true; links: string[] } | { ok: false; problem: LinksProblem; at: number | null } {
  if (inputs.length > MAX_LINKS) {
    return { ok: false, problem: "too_many", at: null };
  }
  const links: string[] = [];
  for (const [at, input] of inputs.entries()) {
    const read = readLink(input);
    if (!read.ok) {
      return { ok: false, problem: read.problem, at };
    }
    if (links.includes(read.url)) {
      return { ok: false, problem: "duplicate", at };
    }
    links.push(read.url);
  }
  return { ok: true, links };
}

/**
 * The links an account starts with: its GitHub profile, for one made with GitHub. Better Auth
 * gives the login only when it makes the account, so one joined to GitHub later starts with none.
 */
export function firstLinks(account: Pick<Account, "githubLogin">): string[] {
  return account.githubLogin ? [`https://github.com/${account.githubLogin}`] : [];
}

/** A service a profile names a link by; anything else is a `website`, named by its host. */
type LinkService =
  | "github"
  | "x"
  | "bluesky"
  | "youtube"
  | "linkedin"
  | "zenn"
  | "qiita"
  | "note"
  | "speakerdeck"
  | "connpass"
  | "website";

/** How a profile shows a link: the service's name or the site's host, and the account, if the address names one. */
export type LinkFace = { service: LinkService; name: string; account: string | null };

type Known = {
  service: Exclude<LinkService, "website">;
  name: string;
  /** Whether a host is this service's. */
  host: (host: string) => boolean;
  /** The account a profile's path names, as the service writes it; null for another page. */
  account: (path: string) => string | null;
};

const exactly =
  (...hosts: string[]) =>
  (host: string) =>
    hosts.includes(host);

/** The path's one segment, `/name` or `/name/`, unless it is one of the service's own pages. */
const single =
  (prefix: string, own: readonly string[] = []) =>
  (path: string) => {
    const name = /^\/([^/]+)\/?$/.exec(path)?.[1];
    return name && !own.includes(name.toLowerCase()) ? `${prefix}${name}` : null;
  };

/** The segment after `/<under>/`, as `/in/name` on LinkedIn. */
const under =
  (segment: string, prefix = "") =>
  (path: string) => {
    const name = new RegExp(`^/${segment}/([^/]+)/?$`).exec(path)?.[1];
    return name ? `${prefix}${name}` : null;
  };

const KNOWN: readonly Known[] = [
  {
    service: "github",
    name: "GitHub",
    host: exactly("github.com"),
    account: single("", ["about", "explore", "features", "orgs", "settings", "sponsors", "topics"]),
  },
  {
    service: "x",
    name: "X",
    host: exactly("x.com", "twitter.com", "mobile.twitter.com", "mobile.x.com"),
    account: single("@", [
      "explore",
      "home",
      "i",
      "intent",
      "messages",
      "notifications",
      "search",
      "settings",
      "share",
    ]),
  },
  {
    service: "bluesky",
    name: "Bluesky",
    host: exactly("bsky.app"),
    account: under("profile", "@"),
  },
  {
    service: "youtube",
    name: "YouTube",
    host: exactly("youtube.com", "m.youtube.com"),
    account: (path) => {
      const handle = /^\/(@[^/]+)\/?/.exec(path)?.[1];
      return handle ?? under("c")(path) ?? under("user")(path);
    },
  },
  {
    service: "linkedin",
    name: "LinkedIn",
    host: (host) => host === "linkedin.com" || host.endsWith(".linkedin.com"),
    account: under("in"),
  },
  {
    service: "zenn",
    name: "Zenn",
    host: exactly("zenn.dev"),
    account: single("@", ["articles", "books", "scraps", "topics"]),
  },
  {
    service: "qiita",
    name: "Qiita",
    host: exactly("qiita.com"),
    account: single("@", ["items", "organizations", "tags", "trend"]),
  },
  {
    service: "note",
    name: "note",
    host: exactly("note.com"),
    account: single("", ["hashtag", "search", "topic"]),
  },
  {
    service: "speakerdeck",
    name: "Speaker Deck",
    host: exactly("speakerdeck.com"),
    account: single("", ["c", "search"]),
  },
  { service: "connpass", name: "connpass", host: exactly("connpass.com"), account: under("user") },
];

/** The account's letters, for one written in percent-encoding; as written when it is not valid. */
function decoded(account: string): string {
  try {
    return decodeURIComponent(account);
  } catch {
    return account;
  }
}

/** How a profile shows `url`, a link `readLink` wrote. */
export function linkFace(url: string): LinkFace {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./, "");
  const known = KNOWN.find((service) => service.host(host));
  if (!known) {
    return { service: "website", name: host, account: null };
  }
  const account = known.account(parsed.pathname);
  return { service: known.service, name: known.name, account: account ? decoded(account) : null };
}
