import { describe, expect, test } from "bun:test";
import { visitInPages } from "../../src/core/page-pool.ts";

/** A page that records what it was asked to do, in order. */
function fakeBrowser() {
  const log: string[] = [];
  let opened = 0;
  let open = 0;
  let mostOpen = 0;
  const openPage = async () => {
    const id = opened++;
    open++;
    mostOpen = Math.max(mostOpen, open);
    return {
      id,
      goto: async (url: string) => {
        log.push(`${id} goto ${url}`);
      },
      close: async () => {
        open--;
        log.push(`${id} close`);
      },
    };
  };
  return {
    log,
    openPage,
    stats: () => ({ opened, open, mostOpen }),
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("visitInPages", () => {
  test("returns each result in item order, however the visits interleave", async () => {
    const browser = fakeBrowser();
    const results = await visitInPages(
      [30, 0, 20, 10, 0],
      browser.openPage,
      async (_page, ms) => {
        await new Promise((resolve) => setTimeout(resolve, ms));
        return ms * 2;
      },
      { lanes: 3 },
    );
    expect(results).toEqual([60, 0, 40, 20, 0]);
  });

  test("opens at most one page per lane and closes every page it opened", async () => {
    const browser = fakeBrowser();
    await visitInPages(
      Array.from({ length: 9 }, (_, index) => index),
      browser.openPage,
      async () => tick(),
      { lanes: 4 },
    );
    expect(browser.stats()).toEqual({ opened: 4, open: 0, mostOpen: 4 });
  });

  test("opens no more pages than there are items", async () => {
    const browser = fakeBrowser();
    await visitInPages(["only"], browser.openPage, async () => tick(), { lanes: 4 });
    expect(browser.stats().opened).toBe(1);
  });

  test("clears the page before every visit, so one slide's globals never reach the next", async () => {
    const browser = fakeBrowser();
    await visitInPages(
      ["a", "b"],
      browser.openPage,
      async (page, item) => {
        browser.log.push(`${page.id} visit ${item}`);
      },
      { lanes: 1 },
    );
    expect(browser.log).toEqual([
      "0 goto about:blank",
      "0 visit a",
      "0 goto about:blank",
      "0 visit b",
      "0 close",
    ]);
  });

  test("stops taking items after a visit fails, closes its pages, and throws that failure", async () => {
    const browser = fakeBrowser();
    const visited: number[] = [];
    await expect(
      visitInPages(
        [0, 1, 2, 3, 4, 5],
        browser.openPage,
        async (_page, item) => {
          visited.push(item);
          await tick();
          if (item === 1) {
            throw new Error("slide 1 broke");
          }
        },
        { lanes: 2 },
      ),
    ).rejects.toThrow("slide 1 broke");
    expect(visited).toEqual([0, 1, 2]);
    expect(browser.stats().open).toBe(0);
  });

  test("throws when a page cannot be opened, after closing the ones that were", async () => {
    const browser = fakeBrowser();
    let calls = 0;
    const openPage = async () => {
      if (calls++ === 1) {
        throw new Error("no page");
      }
      return browser.openPage();
    };
    await expect(
      visitInPages([0, 1, 2], openPage, async () => tick(), { lanes: 2 }),
    ).rejects.toThrow("no page");
    expect(browser.stats().open).toBe(0);
  });

  test("does nothing for no items", async () => {
    const browser = fakeBrowser();
    expect(await visitInPages([], browser.openPage, async () => 1)).toEqual([]);
    expect(browser.stats().opened).toBe(0);
  });
});
