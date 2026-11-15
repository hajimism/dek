// Replacing a stored object only if it has not changed since it was read, as R2's `onlyIf` does:
// when another write lands in between, the attempt is lost and made again from a fresh read.

const ATTEMPTS = 5;

/**
 * Run `attempt` until it writes: it reads, then writes only over what it read, and says whether
 * the write landed. After ATTEMPTS lost races it throws, naming `what` kept changing; an error it
 * throws is thrown at once.
 */
export async function untilWritten(attempt: () => Promise<boolean>, what: string): Promise<void> {
  for (let tried = 0; tried < ATTEMPTS; tried++) {
    if (await attempt()) {
      return;
    }
  }
  throw new Error(`${what} kept changing under the write`);
}
