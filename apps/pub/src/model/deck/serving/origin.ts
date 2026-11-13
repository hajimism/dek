// Each deck is served from an origin of its own, d-<id>.<serving domain>, so one deck's script
// cannot read another's storage. The deck ID's `d_` is left out: a DNS label has no underscore.

const HOST_RE = /^d-([0-9a-z]{10,32})\./;

export function deckOrigin(template: string, deckId: string): string {
  return template.replace("{id}", deckId.replace(/^d_/, ""));
}

/** The deck ID a serving host names, or null for any other host. */
export function deckIdFromHost(host: string): string | null {
  const match = HOST_RE.exec(host.toLowerCase());
  return match?.[1] ? `d_${match[1]}` : null;
}

/** The R2 key of one file of a version. */
export function versionKey(deckId: string, n: number, file: string): string {
  return `decks/${deckId}/v/${n}/${file}`;
}

/** The R2 key of the access file the app writes beside a deck for the serve Worker. */
export function accessKey(deckId: string): string {
  return `decks/${deckId}/access.json`;
}
