// Where a deck lives: /@handle/slug, which a `link` deck opens at only with ?key=.

import type { ShareRequest } from "../../../../../src/pub/protocol.ts";
import { newLinkKey } from "../../common/ids.ts";
import { profilePath } from "../person/profile-path.ts";
import type { Deck, DeckPatch } from "./type.ts";

type Keyed = Pick<Deck, "visibility" | "linkKey">;

export function talkPath(handle: string, slug: string): string {
  return `${profilePath(handle)}/${slug}`;
}

/** The key a `link` deck's URLs carry; none for any other visibility, which opens without it. */
export function linkKeyOf(deck: Keyed): string | null {
  return deck.visibility === "link" ? deck.linkKey : null;
}

/** `path` carrying `key` as `key=`, after any query it has; `path` alone when there is no key. */
export function keyed(path: string, key: string | null): string {
  return key === null ? path : `${path}${path.includes("?") ? "&" : "?"}key=${key}`;
}

/** The path a talk is shared at: a `link` one's carries its key, the others' are bare. */
export function talkHref(handle: string, deck: Keyed & Pick<Deck, "slug">): string {
  return keyed(talkPath(handle, deck.slug), linkKeyOf(deck));
}

/**
 * The columns a share request changes: its settings, and a new link key when it asks for one or
 * makes the deck `link` for the first time. A key outlives a change to another visibility, so the
 * URL given out before opens again when the deck is `link` again.
 */
export function sharePatch(deck: Pick<Deck, "linkKey">, request: ShareRequest): DeckPatch {
  const { newLink, ...settings } = request;
  const needsKey = newLink === true || (settings.visibility === "link" && deck.linkKey === null);
  return needsKey ? { ...settings, linkKey: newLinkKey() } : settings;
}

/** The talk a setting names as `@handle/slug`, else null. */
export function talkNamed(name: string): { segment: string; slug: string } | null {
  const match = /^(@[^/]+)\/([a-z0-9][a-z0-9-]*)$/.exec(name.trim());
  return match?.[1] && match[2] ? { segment: match[1], slug: match[2] } : null;
}
