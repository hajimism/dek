// What the sign-in page says when Better Auth sends someone back to it with `?error=`: from a
// sign-in link, or from GitHub. The code itself is never shown, since anyone can write a URL.

/** The code Better Auth answers with when dek.pub will not make the account asked for (ADR 79). */
export const NOT_INVITED = "not_invited";

/**
 * Why signing in failed: dek.pub does not let the account be made yet, the link has expired or
 * was used, or anything else; null when nothing failed.
 */
export type SignInFailure = "not-invited" | "link-failed" | "failed";

export function signInFailure(code: string | undefined): SignInFailure | null {
  if (code === undefined) {
    return null;
  }
  if (code === NOT_INVITED) {
    return "not-invited";
  }
  return code.toUpperCase() === "INVALID_TOKEN" ? "link-failed" : "failed";
}
