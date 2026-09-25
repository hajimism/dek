export function deckNameFromPathname(pathname: string): string | undefined {
  return pathname.match(/^\/decks\/([^/]+)/)?.[1];
}

export function withDeckPrefix(pathname: string, localPath: string): string {
  const deck = deckNameFromPathname(pathname);
  return deck ? `/decks/${deck}${localPath}` : localPath;
}

/** Inverse of `withDeckPrefix`: `/decks/:name/rest` or a scoped local path. */
export function splitDeckPath(
  pathname: string,
  scopedDeckName?: string,
): { deckName: string; rest: string } | undefined {
  const prefixed = pathname.match(/^\/decks\/([^/]+)(\/.*)?$/);
  if (prefixed?.[1]) {
    // A server scoped to one deck shares that deck, not the rest of the project.
    if (scopedDeckName !== undefined && !namesDeck(prefixed[1], scopedDeckName)) {
      return undefined;
    }
    return { deckName: prefixed[1], rest: prefixed[2] ?? "/" };
  }
  if (!scopedDeckName) {
    return undefined;
  }
  return { deckName: scopedDeckName, rest: pathname };
}

function namesDeck(segment: string, deckName: string): boolean {
  try {
    return segment === deckName || decodeURIComponent(segment) === deckName;
  } catch {
    return false;
  }
}

export function isExactPath(pathname: string, base: string): boolean {
  return pathname === base || pathname === `${base}/`;
}

/**
 * The query a live channel carries for the presenter's token, or nothing on an audience page.
 * `liveReloadScript` embeds this function's source, so it must stay self-contained.
 */
export function liveTokenQuery(token: string | undefined): string {
  return token ? `?token=${encodeURIComponent(token)}` : "";
}

/**
 * The BroadcastChannel a deck's windows share. Built files share one origin under `file://`,
 * so the name carries the deck and its slides: an audience view and a presenter view of one
 * deck follow each other, and two decks open side by side do not.
 */
export function deckChannelName(deck: string | undefined, slugs: readonly string[]): string {
  return `dek:${deck ?? ""}:${slugs.join(",")}`;
}
