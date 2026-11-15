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

/** The R2 prefix every file of a deck is kept under, and nothing of any other deck. */
export function deckPrefix(deckId: string): string {
  return `decks/${deckId}/`;
}

/** The R2 prefix every version of a deck is kept under, each in a folder named by its number. */
export function versionsPrefix(deckId: string): string {
  return `${deckPrefix(deckId)}v/`;
}

/** The R2 key of one file of a version. */
export function versionKey(deckId: string, n: number, file: string): string {
  return `${versionsPrefix(deckId)}${n}/${file}`;
}

/** The R2 key of the access file the app writes beside a deck for the serve Worker. */
export function accessKey(deckId: string): string {
  return `${deckPrefix(deckId)}access.json`;
}
