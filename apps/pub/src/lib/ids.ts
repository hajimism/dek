// Random IDs. A deck's goes into a DNS label, so every ID is lowercase letters and digits only.

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

function randomId(prefix: string, length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = prefix;
  for (const byte of bytes) {
    id += ALPHABET[byte % 36];
  }
  return id;
}

export const newDeckId = (): string => randomId("d_", 16);
export const newThreadId = (): string => randomId("c_", 16);
export const newReplyId = (): string => randomId("r_", 16);
export const newGrantId = (): string => randomId("g_", 16);
