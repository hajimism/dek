// Where a deck lives: /@handle/slug.

import { profilePath } from "../person/profile-path.ts";

export function talkPath(handle: string, slug: string): string {
  return `${profilePath(handle)}/${slug}`;
}

/** The talk a setting names as `@handle/slug`, else null. */
export function talkNamed(name: string): { segment: string; slug: string } | null {
  const match = /^(@[^/]+)\/([a-z0-9][a-z0-9-]*)$/.exec(name.trim());
  return match?.[1] && match[2] ? { segment: match[1], slug: match[2] } : null;
}
