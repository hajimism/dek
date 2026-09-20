import { describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekError } from "../../src/core/error.ts";
import { resolvePackageFromAncestors } from "../../src/core/optional.ts";
import {
  defaultPlaywrightRunner,
  parseVisualResponse,
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

describe("playwright worker", () => {
  test.skipIf(!playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT))(
    "reports font size and weight with each contrast sample",
    async () => {
      const response = await defaultPlaywrightRunner({
        viewport: { width: 1280, height: 720 },
        actions: ["contrast"],
        pages: [
          {
            html: `<html><body style="margin:0;background:#fff"><section class="slide" style="background:#fff">
  <h2 style="font-size:32px;font-weight:700;color:#777">big</h2>
</section></body></html>`,
            slug: "intro",
            step: "1",
          },
        ],
      });
      const sample = response?.contrasts.find((entry) => entry.slug === "intro");
      expect(sample?.fontSize).toBeCloseTo(32, 0);
      expect(sample?.fontWeight).toBe(700);
    },
  );
});

describe("playwright worker morph", () => {
  test.skipIf(!playwrightResolved() || Boolean(process.env.DEK_PLAYWRIGHT))(
    "freezes a view transition at --at and produces a distinct frame",
    async () => {
      const { withTempProject } = await import("../helpers/project.ts");
      const { slideDocument } = await import("../helpers/html.ts");
      const { shotMorph } = await import("../../src/core/shot.ts");
      const { playerScript } = await import("../../src/runtime/player.ts");
      const { defaultTheme } = await import("../../src/cli/files.ts");
      const script = `---
title: Demo
---

## problem

first

## architecture

second
`;
      const problem = slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">problem</h2>
  <p class="node" data-morph="pipeline">pipeline</p>
</section>`);
      const architecture = slideDocument(`<section class="slide" data-layout="title">
  <p class="node node-parent" data-morph="pipeline">pipeline</p>
</section>`);
      await withTempProject(
        {
          decks: [
            {
              name: "demo",
              script,
              theme: defaultTheme(),
              slides: { problem, architecture },
            },
          ],
        },
        async (root) => {
          const deckDir = join(root, "decks", "demo");
          const player = await playerScript();
          const frames: Buffer[] = [];
          for (const at of [0, 0.5, 1]) {
            const [shot] = await shotMorph(deckDir, {
              from: "problem",
              to: "architecture",
              at,
              playerScript: player,
            });
            frames.push(Buffer.from(await Bun.file(shot?.path ?? "").arrayBuffer()));
          }
          expect(frames[0]?.equals(frames[1] ?? Buffer.alloc(0))).toBe(false);
          expect(frames[1]?.equals(frames[2] ?? Buffer.alloc(0))).toBe(false);
          expect(frames[0]?.equals(frames[2] ?? Buffer.alloc(0))).toBe(false);
        },
      );
    },
  );
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
