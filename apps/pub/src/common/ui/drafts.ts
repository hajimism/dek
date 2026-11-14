// What a person typed into a composer and has not sent, kept in this browser so a reload does not
// lose it. Each composer has its own key, which the model it belongs to makes with draftKey: the
// deck, the kind of text, and what it answers to. Where storage is blocked, or on the server where
// there is none, nothing is kept.

const PREFIX = "dek.pub:draft";

/** The key of a draft on `deckId`: its kind, then what it answers to, if anything. */
export function draftKey(deckId: string, kind: string, of?: string): string {
  return of === undefined ? `${PREFIX}:${deckId}:${kind}` : `${PREFIX}:${deckId}:${kind}:${of}`;
}

/** The text kept under `key`, or "" when there is none. */
export function readDraft(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** Keep `text` under `key`; text with nothing in it takes the draft away. */
export function keepDraft(key: string, text: string): void {
  try {
    if (text.trim()) {
      localStorage.setItem(key, text);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Storage is blocked or full: the text stays on the page alone, as it did before drafts.
  }
}

export function dropDraft(key: string): void {
  keepDraft(key, "");
}
