import { describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import {
  defaultPlaywrightRunner,
  parseVisualResponse,
  playwrightMissingError,
  playwrightResolved,
  resolvePlaywrightModule,
} from "../../src/core/playwright.ts";
import { withEnv } from "../helpers/env.ts";
import { withTempDir } from "../helpers/fs.ts";

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

const request = {
  viewport: { width: 1280, height: 720 } as const,
  actions: ["overflow" as const],
  pages: [{ html: "<html></html>" }],
};

describe("defaultPlaywrightRunner", () => {
  test("returns null when the runner is missing", async () => {
    await withEnv({ DEK_PLAYWRIGHT: "/no/such/playwright" }, async () => {
      expect(playwrightResolved()).toBe(false);
      expect(await defaultPlaywrightRunner(request)).toBeNull();
    });
  });

  test("returns null quickly when the playwright package is not installed", async () => {
    await withEnv({ DEK_PLAYWRIGHT: undefined }, async () => {
      if (!playwrightResolved()) {
        const started = Date.now();
        expect(await defaultPlaywrightRunner(request)).toBeNull();
        expect(Date.now() - started).toBeLessThan(1000);
      }
    });
  });

  test("returns JSON from DEK_PLAYWRIGHT stdin/stdout", async () => {
    await chmod(fakePlaywright, 0o755);
    await withEnv({ DEK_PLAYWRIGHT: fakePlaywright }, async () => {
      const response = await defaultPlaywrightRunner(request);
      expect(response).toEqual({ overflows: [], contrasts: [] });
    });
  });

  test("writes a pdfPath from DEK_PLAYWRIGHT and returns it", async () => {
    await chmod(fakePlaywright, 0o755);
    await withTempDir(async (dir) => {
      const pdfPath = join(dir, "demo.pdf");
      await withEnv({ DEK_PLAYWRIGHT: fakePlaywright }, async () => {
        const response = await defaultPlaywrightRunner({
          viewport: { width: 1280, height: 720 },
          actions: ["pdf"],
          pages: [{ html: "<html></html>" }],
          pdfPath,
        });
        expect(await Bun.file(pdfPath).exists()).toBe(true);
        expect(response).toMatchObject({ pdfPath });
      });
    });
  });

  test.serial(
    "fails when the worker runs past timeoutMs, so a hung browser cannot hang dek",
    async () => {
      const slow = join(import.meta.dir, "..", "helpers", "fake-playwright-slow.ts");
      await withEnv({ DEK_PLAYWRIGHT: slow }, async () => {
        await expect(defaultPlaywrightRunner(request, { timeoutMs: 20 })).rejects.toMatchObject({
          name: "DekError",
          message: "Playwright worker failed",
          hint: expect.stringContaining("did not finish"),
        });
      });
    },
  );

  test.serial("throws when an installed worker exits non-zero", async () => {
    const fail = join(import.meta.dir, "..", "helpers", "fake-playwright-fail.ts");
    await withEnv({ DEK_PLAYWRIGHT: fail }, async () => {
      await expect(defaultPlaywrightRunner(request)).rejects.toMatchObject({
        name: "DekError",
        message: "Playwright worker failed",
      });
    });
  });

  test.serial("throws when spawn fails for a resolved runner", async () => {
    await withEnv(
      { DEK_PLAYWRIGHT: join(import.meta.dir, "missing-playwright-worker.ts") },
      async () => {
        expect(playwrightResolved()).toBe(true);
        await expect(defaultPlaywrightRunner(request)).rejects.toBeInstanceOf(DekError);
      },
    );
  });
});

describe("resolvePlaywrightModule", () => {
  // The working directory is process-wide too.
  test.serial("never imports a playwright that the working directory holds", async () => {
    await withTempDir(async (dir) => {
      const pkg = join(dir, "node_modules", "playwright");
      await mkdir(pkg, { recursive: true });
      await writeFile(
        join(pkg, "package.json"),
        `${JSON.stringify({ name: "playwright", main: "index.js" })}\n`,
      );
      await writeFile(join(pkg, "index.js"), "module.exports = {}\n");
      const nested = join(dir, "decks", "why-dek");
      await mkdir(nested, { recursive: true });
      const cwd = process.cwd();
      await withEnv({ DEK_PLAYWRIGHT: undefined }, async () => {
        try {
          process.chdir(nested);
          // It resolves from dek's own install, as `bun add -d playwright` beside dek puts it.
          expect(resolvePlaywrightModule()).not.toBe(join(pkg, "index.js"));
        } finally {
          process.chdir(cwd);
        }
      });
    });
  });
});

describe("parseVisualResponse", () => {
  test("keeps pdfPath from the worker JSON", () => {
    expect(
      parseVisualResponse(
        JSON.stringify({
          overflows: [],
          contrasts: [],
          pdfPath: "/tmp/demo.pdf",
        }),
      ),
    ).toMatchObject({
      overflows: [],
      contrasts: [],
      pdfPath: "/tmp/demo.pdf",
    });
  });
});

describe("playwrightMissingError", () => {
  test("installs the module before the browser", () => {
    expect(playwrightMissingError().hint).toBe(
      "bun add -d playwright && bunx playwright install chromium",
    );
  });
});
