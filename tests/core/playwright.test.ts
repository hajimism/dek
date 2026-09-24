import { describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import { resolvePackageFromAncestors } from "../../src/core/optional.ts";
import {
  defaultPlaywrightRunner,
  parseVisualResponse,
  playwrightMissingError,
  playwrightResolved,
  resolvePlaywrightModule,
} from "../../src/core/playwright.ts";
import { withTempDir } from "../helpers/fs.ts";

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

const request = {
  viewport: { width: 1280, height: 720 } as const,
  actions: ["overflow" as const],
  pages: [{ html: "<html></html>" }],
};

describe("defaultPlaywrightRunner", () => {
  test("returns null when the runner is missing", async () => {
    const previous = process.env.DEK_PLAYWRIGHT;
    process.env.DEK_PLAYWRIGHT = "/no/such/playwright";
    try {
      expect(playwrightResolved()).toBe(false);
      expect(await defaultPlaywrightRunner(request)).toBeNull();
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_PLAYWRIGHT;
      } else {
        process.env.DEK_PLAYWRIGHT = previous;
      }
    }
  });

  test("returns null quickly when the playwright package is not installed", async () => {
    const previous = process.env.DEK_PLAYWRIGHT;
    delete process.env.DEK_PLAYWRIGHT;
    try {
      if (!playwrightResolved()) {
        const started = Date.now();
        expect(await defaultPlaywrightRunner(request)).toBeNull();
        expect(Date.now() - started).toBeLessThan(1000);
      }
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_PLAYWRIGHT;
      } else {
        process.env.DEK_PLAYWRIGHT = previous;
      }
    }
  });

  test("returns JSON from DEK_PLAYWRIGHT stdin/stdout", async () => {
    await chmod(fakePlaywright, 0o755);
    const previous = process.env.DEK_PLAYWRIGHT;
    process.env.DEK_PLAYWRIGHT = fakePlaywright;
    try {
      const response = await defaultPlaywrightRunner(request);
      expect(response).toEqual({ overflows: [], contrasts: [] });
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_PLAYWRIGHT;
      } else {
        process.env.DEK_PLAYWRIGHT = previous;
      }
    }
  });

  test("writes a pdfPath from DEK_PLAYWRIGHT and returns it", async () => {
    await chmod(fakePlaywright, 0o755);
    await withTempDir(async (dir) => {
      const pdfPath = join(dir, "demo.pdf");
      const previous = process.env.DEK_PLAYWRIGHT;
      process.env.DEK_PLAYWRIGHT = fakePlaywright;
      try {
        const response = await defaultPlaywrightRunner({
          viewport: { width: 1280, height: 720 },
          actions: ["pdf"],
          pages: [{ html: "<html></html>" }],
          pdfPath,
        });
        expect(await Bun.file(pdfPath).exists()).toBe(true);
        expect(response).toMatchObject({ pdfPath });
      } finally {
        if (previous === undefined) {
          delete process.env.DEK_PLAYWRIGHT;
        } else {
          process.env.DEK_PLAYWRIGHT = previous;
        }
      }
    });
  });

  test.serial("returns JSON when the worker is slower than timeoutMs", async () => {
    const slow = join(import.meta.dir, "..", "helpers", "fake-playwright-slow.ts");
    const previous = process.env.DEK_PLAYWRIGHT;
    process.env.DEK_PLAYWRIGHT = slow;
    try {
      const response = await defaultPlaywrightRunner(request, { timeoutMs: 30 });
      expect(response).toEqual({ overflows: [], contrasts: [] });
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_PLAYWRIGHT;
      } else {
        process.env.DEK_PLAYWRIGHT = previous;
      }
    }
  });

  test.serial("throws when an installed worker exits non-zero", async () => {
    const fail = join(import.meta.dir, "..", "helpers", "fake-playwright-fail.ts");
    const previous = process.env.DEK_PLAYWRIGHT;
    process.env.DEK_PLAYWRIGHT = fail;
    try {
      await expect(defaultPlaywrightRunner(request)).rejects.toMatchObject({
        name: "DekError",
        message: "Playwright worker failed",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_PLAYWRIGHT;
      } else {
        process.env.DEK_PLAYWRIGHT = previous;
      }
    }
  });

  test.serial("throws when spawn fails for a resolved runner", async () => {
    const previous = process.env.DEK_PLAYWRIGHT;
    process.env.DEK_PLAYWRIGHT = join(import.meta.dir, "missing-playwright-worker.ts");
    try {
      expect(playwrightResolved()).toBe(true);
      await expect(defaultPlaywrightRunner(request)).rejects.toBeInstanceOf(DekError);
    } finally {
      if (previous === undefined) {
        delete process.env.DEK_PLAYWRIGHT;
      } else {
        process.env.DEK_PLAYWRIGHT = previous;
      }
    }
  });
});

describe("resolvePlaywrightModule", () => {
  test("finds playwright in an ancestor node_modules from a nested cwd", async () => {
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
      const previous = process.env.DEK_PLAYWRIGHT;
      const cwd = process.cwd();
      delete process.env.DEK_PLAYWRIGHT;
      try {
        process.chdir(nested);
        expect(resolvePackageFromAncestors("playwright", nested)).toBe(join(pkg, "index.js"));
        expect(resolvePlaywrightModule()).toContain("playwright");
        expect(playwrightResolved()).toBe(true);
      } finally {
        process.chdir(cwd);
        if (previous === undefined) {
          delete process.env.DEK_PLAYWRIGHT;
        } else {
          process.env.DEK_PLAYWRIGHT = previous;
        }
      }
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
