/** The part of a Playwright page the pool drives. */
export type PoolPage = {
  goto(url: string): Promise<unknown>;
  close(): Promise<void>;
};

/**
 * How many pages a worker renders at once. A new page costs Chromium about
 * as much as rendering a slide on it, so pages are kept and reused; a few at
 * a time keep the renderer busy without keeping a long deck alive at once.
 */
export const PAGE_LANES = 4;

/**
 * Visits every item on a small set of reused pages and returns the results
 * in item order. Each visit starts from about:blank, so what one slide's
 * scripts left on `window` never reaches the next. After a visit fails, no
 * lane takes another item; every page is closed and the first failure thrown.
 */
export async function visitInPages<P extends PoolPage, T, R>(
  items: readonly T[],
  openPage: () => Promise<P>,
  visit: (page: P, item: T) => Promise<R>,
  { lanes = PAGE_LANES }: { lanes?: number } = {},
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  const lane = async (): Promise<void> => {
    let page: P | undefined;
    try {
      page = await openPage();
      while (!failed && next < items.length) {
        const index = next++;
        await page.goto("about:blank");
        results[index] = await visit(page, items[index] as T);
      }
    } catch (error) {
      if (!failed) {
        failed = true;
        failure = error;
      }
    } finally {
      await page?.close();
    }
  };
  await Promise.all(Array.from({ length: Math.min(lanes, items.length) }, lane));
  if (failed) {
    throw failure;
  }
  return results;
}
