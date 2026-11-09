/**
 * What `promise` rejects with, for a test to match; an Error when it resolves instead.
 *
 * Use it where a test waits seconds for a rejection, in place of `expect(promise).rejects`. Bun
 * waits for that promise by running the event loop where `expect` was called, so a test whose wait
 * began first cannot go on until every such wait begun inside it ends. The tests of a file run at
 * once (bunfig.toml's concurrentTestGlob), and in some orders a quick one stalls behind a slow one
 * until it times out. Awaiting the promise itself leaves the other tests free.
 */
export async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected the promise to reject, but it resolved");
}
