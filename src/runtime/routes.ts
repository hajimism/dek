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
    return { deckName: prefixed[1], rest: prefixed[2] ?? "/" };
  }
  if (!scopedDeckName) {
    return undefined;
  }
  return { deckName: scopedDeckName, rest: pathname };
}

export function isExactPath(pathname: string, base: string): boolean {
  return pathname === base || pathname === `${base}/`;
}
