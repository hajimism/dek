// A profile's URL segment is `@handle`; anything else there is not a profile.

import { isHandle } from "./handle.ts";

/** The handle a segment names, else null. Hono has decoded the segment already; decoding it again would read `%25` as a lone `%`. */
export function handleOf(segment: string | undefined): string | null {
  const value = segment ?? "";
  const handle = value.startsWith("@") ? value.slice(1).toLowerCase() : "";
  return isHandle(handle) ? handle : null;
}

export function profilePath(handle: string): string {
  return `/@${handle}`;
}
