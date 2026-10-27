import { describe, expect } from "bun:test";
import { join } from "node:path";
import { playwrightResolved } from "../../src/core/playwright.ts";
import { serialBrowserTest } from "./browser.ts";
import { withTempDir } from "./fs.ts";

const skip = !playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT);
const browserTest = serialBrowserTest(skip);

const root = join(import.meta.dir, "..", "..");

/** A test file of two on one shared browser, the first running past its timeout with it open. */
const timingOut = `import { expect } from "bun:test";
import { serialBrowserTest, sharedBrowser } from ${JSON.stringify(join(import.meta.dir, "browser.ts"))};

const browserTest = serialBrowserTest(false);
const withBrowser = sharedBrowser();

browserTest("runs past its timeout", async () => {
  await (await withBrowser((browser) => browser.newPage())).close();
  await Bun.sleep(3000);
}, 500);

browserTest("draws a page after it", async () => {
  const page = await withBrowser((browser) => browser.newPage());
  await page.setContent("<p>drawn</p>");
  expect(await page.evaluate(() => document.querySelector("p")?.textContent)).toBe("drawn");
  await page.close();
});
`;

describe("sharedBrowser", () => {
  // A timeout makes Bun kill every process still running, the shared browser too.
  browserTest("lets a test that times out fail alone, not the tests after it", async () => {
    await withTempDir(async (dir) => {
      const file = join(dir, "timing-out.test.ts");
      await Bun.write(file, timingOut);
      const run = Bun.spawn([process.execPath, "test", file], {
        cwd: root,
        stdout: "pipe",
        stderr: "pipe",
      });
      const [stdout, stderr] = await Promise.all([
        new Response(run.stdout).text(),
        new Response(run.stderr).text(),
      ]);
      await run.exited;
      const output = `${stdout}${stderr}`;
      expect(output.match(/^\(fail\) .*$/gm)).toEqual([
        expect.stringContaining("runs past its timeout"),
      ]);
      expect(output).toMatch(/^ *1 pass$/m);
    });
  });
});
