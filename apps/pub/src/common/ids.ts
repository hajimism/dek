// Random IDs. A deck's goes into a DNS label, so every ID is lowercase letters and digits only.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

// A byte below 252 (7 × 36), divided by 7, picks each character as often as every other; a byte
// at or above it is drawn again.
const LIMIT = 7 * ALPHABET.length;

function randomId(prefix: string, length: number): string {
  let id = prefix;
  while (id.length < prefix.length + length) {
    const [byte = LIMIT] = crypto.getRandomValues(new Uint8Array(1));
    if (byte < LIMIT) {
      id += ALPHABET[Math.floor(byte / 7)];
    }
  }
  return id;
}

export const newDeckId = (): string => randomId("d_", 16);
export const newThreadId = (): string => randomId("c_", 16);
export const newReplyId = (): string => randomId("r_", 16);
export const newGrantId = (): string => randomId("g_", 16);
export const newPublicCommentId = (): string => randomId("p_", 16);

/** The secret a `link` deck's URL carries: 26 characters, about 134 bits. */
export const newLinkKey = (): string => randomId("", 26);

/**
 * Whether `given` is the deck's `key`, compared in a time that does not tell how much of it
 * matched. Every key has the same length, so checking that first gives nothing away.
 */
export function sameKey(key: string | null, given: string | null | undefined): boolean {
  if (!key || typeof given !== "string" || given.length !== key.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < key.length; i++) {
    difference |= key.charCodeAt(i) ^ given.charCodeAt(i);
  }
  return difference === 0;
}
