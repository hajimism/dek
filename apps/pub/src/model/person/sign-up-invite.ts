// Who an operator invites to sign up, from /settings (ADR 85). An entry is an email address, or `@`
// and a GitHub login for a GitHub account whatever its address, kept trimmed and in lowercase. An
// entry lets in the first account made for it, which claims it. The page checks what is typed by
// these rules before it sends anything, and the server checks again.

/** How many entries one add takes. */
export const MAX_INVITES_PER_ADD = 50;

/** The longest address an entry may be, as SMTP bounds a path. */
export const MAX_ADDRESS_LENGTH = 254;

// An address with no quoting, comments or brackets, on a domain of two labels or more; anything a
// mail header would read otherwise is refused, not escaped.
const ADDRESS = /^[a-z0-9.!#$%&'+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// A login as GitHub gives them: letters, digits and single hyphens between them, up to 39.
const GITHUB_LOGIN = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;

/** `input` as an entry: an address, or `@` and a GitHub login, in lowercase; null for anything else. */
export function readInviteEntry(input: string): string | null {
  const entry = input.trim().toLowerCase();
  if (entry.startsWith("@")) {
    return GITHUB_LOGIN.test(entry.slice(1)) ? entry : null;
  }
  return entry.length <= MAX_ADDRESS_LENGTH && ADDRESS.test(entry) ? entry : null;
}

/** Why a list of entries is not added: one of them, as typed, is no entry; or there are none, or too many. */
export type InvitesProblem =
  | { problem: "invalid"; entry: string }
  | { problem: "empty" }
  | { problem: "too_many" };

/** The entries `inputs` read as, each once, in their order; or why the list as a whole is refused. */
export function readInviteEntries(
  inputs: readonly string[],
): { ok: true; entries: string[] } | ({ ok: false } & InvitesProblem) {
  if (inputs.length === 0) {
    return { ok: false, problem: "empty" };
  }
  if (inputs.length > MAX_INVITES_PER_ADD) {
    return { ok: false, problem: "too_many" };
  }
  const entries = new Set<string>();
  for (const input of inputs) {
    const entry = readInviteEntry(input);
    if (entry === null) {
      return { ok: false, problem: "invalid", entry: input };
    }
    entries.add(entry);
  }
  return { ok: true, entries: [...entries] };
}

/** What an operator typed, split into entries at commas and whitespace, each as typed. */
export function splitInviteInput(text: string): string[] {
  return text.split(/[\s,]+/).filter(Boolean);
}

/** Whether an entry names a GitHub login, which no mail can reach. */
export function isLoginEntry(entry: string): boolean {
  return entry.startsWith("@");
}

/**
 * The entries that would name `who`: its address, once verified, and its GitHub login. An address
 * that is not verified names no one, so the development email form, which verifies none, never
 * claims an entry or gets in by one.
 */
export function inviteEntriesOf(who: {
  email: string;
  emailVerified: boolean;
  githubLogin: string | null;
}): string[] {
  return [
    ...(who.emailVerified ? [who.email.toLowerCase()] : []),
    ...(who.githubLogin ? [`@${who.githubLogin.toLowerCase()}`] : []),
  ];
}
