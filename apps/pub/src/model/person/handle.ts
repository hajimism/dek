// A handle names a person in URLs, as /@handle: lowercase letters, digits and single hyphens,
// as GitHub logins are, so a GitHub login maps to one handle with nothing lost but case.

const HANDLE_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/;

export function isHandle(value: string): boolean {
  return HANDLE_RE.test(value);
}

export function normalizeHandle(login: string): string {
  return login.toLowerCase();
}

/** A handle for an account made with an email address, by a sign-in link. */
export function handleFromEmail(email: string): string {
  const local = (email.split("@")[0] ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 39);
  return local || "user";
}
