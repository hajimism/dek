// The way to the sign-in page and back, and to the page a new account chooses its handle on. Only
// a path on this site comes back: a `?next=` that names another origin would make either page a
// way to send people anywhere.

/** The sign-in page, coming back to `next` after; the front page and sign-in itself need no way back. */
export function signInHref(next?: string): string {
  return !next || next === "/" || next.startsWith("/signin")
    ? "/signin"
    : `/signin?next=${encodeURIComponent(next)}`;
}

/** Where to go after signing in: `next` if it is a path on this site, else `fallback`. */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return [...next].some((char) => char.charCodeAt(0) < 32) ? fallback : next;
}

/**
 * The page to choose a handle on, coming back to `next` after; the front page and the choosing
 * page itself need no way back.
 */
export function welcomeHref(next: string): string {
  return next === "/" || next.startsWith("/welcome")
    ? "/welcome"
    : `/welcome?next=${encodeURIComponent(next)}`;
}
