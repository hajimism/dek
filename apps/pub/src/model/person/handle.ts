// A handle names a person in URLs, as /@handle: lowercase letters, digits and single hyphens,
// as GitHub logins are, so a GitHub login maps to one handle with nothing lost but case. Each
// person chooses theirs once, after their first sign-in; dek.pub only suggests one (ADR 77).

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;

/**
 * Handles no one may choose, so that nobody can pose as dek.pub or the people who run it, or
 * take a name its pages give to no one in particular.
 */
const RESERVED = new Set([
  "dek",
  "dekc",
  "dekpub",
  "dek-pub",
  "dekusercontent",
  "admin",
  "administrator",
  "root",
  "system",
  "sysadmin",
  "operator",
  "moderator",
  "staff",
  "team",
  "official",
  "support",
  "help",
  "helpdesk",
  "contact",
  "info",
  "security",
  "abuse",
  "postmaster",
  "hostmaster",
  "webmaster",
  "mail",
  "noreply",
  "no-reply",
  "api",
  "about",
  "settings",
  "account",
  "welcome",
  "signin",
  "signup",
  "login",
  "logout",
  "someone",
  "anonymous",
  "null",
  "undefined",
]);

export function isHandle(value: string): boolean {
  return HANDLE_RE.test(value);
}

export function isReservedHandle(value: string): boolean {
  return RESERVED.has(value);
}

/** What keeps `value` from being chosen as a handle: its form, or that it is reserved; null if nothing. */
export function handleProblem(value: string): "invalid" | "reserved" | null {
  if (!isHandle(value)) {
    return "invalid";
  }
  return isReservedHandle(value) ? "reserved" : null;
}

/** A handle as typed, or as a GitHub login gives it: case and the spaces around do not count. */
export function normalizeHandle(value: string): string {
  return value.trim().toLowerCase();
}

/** An address's local part as a handle: what is not a letter or a digit becomes a hyphen. */
function handleFromEmail(email: string): string {
  return (email.split("@")[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 39)
    .replace(/-$/, "");
}

/**
 * The handle the page to choose one offers first: the GitHub login of an account made with
 * GitHub, else the address's local part, whichever may be chosen; null when neither may. Whether
 * someone holds it already is for the store to say.
 */
export function suggestHandle(account: {
  githubLogin: string | null;
  email: string;
}): string | null {
  const candidates = [
    account.githubLogin === null ? "" : normalizeHandle(account.githubLogin),
    handleFromEmail(account.email),
  ];
  return candidates.find((handle) => handleProblem(handle) === null) ?? null;
}
