import { generateRemotePassword } from "./lan.ts";

/** How long a pairing code shown as a QR code stays good, used or not. */
export const PAIRING_TTL_MS = 5 * 60 * 1000;

/**
 * One-use codes that let a phone in as the presenter by scanning a QR code, without typing the
 * password. A code works once and for a few minutes, so a photo of a projected terminal is worth
 * nothing by the time anyone could use it; the password stays for any other device.
 */
export type Pairings = {
  /** A fresh code; the ones before it stay good until used or expired. */
  issue(): string;
  /** True, once, for a code that was issued and has not expired. */
  redeem(code: string): boolean;
};

export function createPairings(options: { ttlMs?: number; now?: () => number } = {}): Pairings {
  const ttlMs = options.ttlMs ?? PAIRING_TTL_MS;
  const now = options.now ?? Date.now;
  const open = new Map<string, number>();
  return {
    issue() {
      // 16 letters of the password alphabet: 80 bits, for a code that lives five minutes.
      const code = generateRemotePassword(16);
      open.set(code, now() + ttlMs);
      return code;
    },
    redeem(code) {
      const expires = open.get(code);
      open.delete(code);
      for (const [other, at] of open) {
        if (at <= now()) {
          open.delete(other);
        }
      }
      return expires !== undefined && expires > now();
    },
  };
}
