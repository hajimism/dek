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
