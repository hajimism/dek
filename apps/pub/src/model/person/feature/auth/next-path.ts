// Where to go after signing in. Only a path on this site: a `?next=` that names another origin
// would make the sign-in page a way to send people anywhere.

export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next?.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return [...next].some((char) => char.charCodeAt(0) < 32) ? fallback : next;
}
