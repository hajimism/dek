import { describe, expect, spyOn, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Browser } from "playwright";
import { DekError } from "../../src/core/error.ts";
import {
  defaultPlaywrightRunner,
  launchChromium,
  type PagesRequest,
  PLAYWRIGHT_INSTALL,
  parseVisualResponse,
  playwrightMissingError,
  playwrightResolved,
  refPlaywrightRunner,
  requirePlaywright,
  resolvePlaywrightModule,
  type VisualRequest,
} from "../../src/core/playwright.ts";
import { type SandboxMode, takeUnsandboxed } from "../../src/core/sandbox.ts";
import { withEnv } from "../helpers/env.ts";
import { withTempDir } from "../helpers/fs.ts";
import {
  CHROMIUM_MISSING,
  SANDBOX_FAILED,
  SANDBOX_REASON,
  ZYGOTE_FAILED,
  ZYGOTE_REASON,
} from "../helpers/sandbox.ts";

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

const request: PagesRequest = {
  kind: "pages",
  viewport: { width: 1280, height: 720 },
  actions: ["overflow"],
  pages: [{ html: "<html></html>", slug: "intro", step: "1" }],
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
      expect(response).toEqual({
        overflows: [],
        contrasts: [],
        drawErrors: [],
        collisions: [],
        fills: [],
        lineBreaks: [],
        misalignments: [],
      });
    });
  });

  test("writes the pdfPath a pdf request names", async () => {
    await chmod(fakePlaywright, 0o755);
    await withTempDir(async (dir) => {
      const pdfPath = join(dir, "demo.pdf");
      await withEnv({ DEK_PLAYWRIGHT: fakePlaywright }, async () => {
        const response = await defaultPlaywrightRunner({
          kind: "pdf",
          viewport: { width: 1280, height: 720 },
          html: "<html></html>",
          pdfPath,
        });
        expect(await Bun.file(pdfPath).exists()).toBe(true);
        expect(response).toEqual({});
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

describe("playwrightMissingError", () => {
  test("installs the module before the browser", () => {
    expect(playwrightMissingError().hint).toBe(
      "bun add -d playwright && bunx playwright install chromium",
    );
  });
});

describe("parseVisualResponse", () => {
  const overflow = { slug: "intro", step: "1", box: "ul", text: "a", by: { bottom: 12 } };
  const contrast = {
    slug: "intro",
    step: "1",
    ratio: 2.1,
    box: "p",
    fg: "rgb(68, 68, 68)",
    bg: "rgb(17, 17, 17)",
    fontSize: 20,
    fontWeight: 400,
  };
  const motion = [
    {
      label: "arrival",
      frames: [
        { ms: 12.5, path: "/f.png" },
        { ms: 40, path: "/e.png", end: true as const },
      ],
    },
  ];
  const parse = (fields: object, kind: VisualRequest["kind"]) =>
    parseVisualResponse(JSON.stringify(fields), kind);

  test("reads each kind's answer with that kind's parser", () => {
    expect(parse({ overflows: [overflow], contrasts: [contrast] }, "pages")).toEqual({
      overflows: [overflow],
      contrasts: [contrast],
      drawErrors: [],
      collisions: [],
      fills: [],
      lineBreaks: [],
      misalignments: [],
    });
    const thrown = {
      slug: "intro",
      step: "1",
      t: 0,
      kind: "throw" as const,
      message: "Error: boom",
    };
    expect(parse({ overflows: [], contrasts: [], drawErrors: [thrown] }, "pages")).toEqual({
      overflows: [],
      contrasts: [],
      drawErrors: [thrown],
      collisions: [],
      fills: [],
      lineBreaks: [],
      misalignments: [],
    });
    expect(parse({ motion, sheets: ["/s.png"] }, "motion")).toEqual({
      motion,
      sheets: ["/s.png"],
    });
    // A morph frame or a PDF is on disk where the request named it; the answer says only "done".
    expect(parse({}, "morph")).toEqual({});
    expect(parse({}, "pdf")).toEqual({});
  });

  test("keeps only what the kind it asked for answers with", () => {
    expect(
      parse({ overflows: [], contrasts: [], screenshotPath: "/a.png", sheets: [] }, "pages"),
    ).toEqual({
      overflows: [],
      contrasts: [],
      drawErrors: [],
      collisions: [],
      fills: [],
      lineBreaks: [],
      misalignments: [],
    });
    expect(parse({ motion, sheets: [], overflows: [] }, "motion")).toEqual({ motion, sheets: [] });
    expect(parse({ pdfPath: "/a.pdf" }, "pdf")).toEqual({});
  });

  test("reads each line break with the fields its kind carries", () => {
    const split = {
      slug: "intro",
      step: "1",
      box: "h2.slide-title",
      text: "AIはここが苦手です",
      kind: "split",
      lines: ["AIはここが苦", "手です"],
      phrased: ["AIはここが", "苦手です"],
      wordBreak: "normal",
      textWrap: "wrap",
    };
    const { phrased: _phrased, ...short } = { ...split, kind: "short", tail: "す" };
    const pages = (lineBreaks: object[]) =>
      parse({ overflows: [], contrasts: [], lineBreaks }, "pages");
    expect(pages([split, short])).toMatchObject({ lineBreaks: [split, short] });
    expect(pages([{ ...split, phrased: undefined }])).toBeNull();
    expect(pages([{ ...short, tail: 2 }])).toBeNull();
    expect(pages([{ ...split, kind: "wrapped" }])).toBeNull();
    expect(pages([{ ...split, lines: "AIはここが苦手です" }])).toBeNull();
    expect(pages([{ ...split, textWrap: undefined }])).toBeNull();
  });

  test("reads each misalignment with the edge and how far apart", () => {
    const miss = {
      slug: "intro",
      step: "1",
      box: "div.card",
      text: "速い",
      other: "div.card",
      otherText: "安い",
      edge: "top",
      of: "box",
      by: 3,
    };
    const pages = (misalignments: object[]) =>
      parse({ overflows: [], contrasts: [], misalignments }, "pages");
    expect(pages([miss, { ...miss, edge: "left", of: "text" }])).toMatchObject({
      misalignments: [miss, { ...miss, edge: "left", of: "text" }],
    });
    expect(pages([{ ...miss, edge: "up" }])).toBeNull();
    expect(pages([{ ...miss, of: "glyph" }])).toBeNull();
    expect(pages([{ ...miss, by: "3" }])).toBeNull();
    expect(pages([{ ...miss, other: undefined }])).toBeNull();
  });

  test("answers null to anything short of what the kind promises", () => {
    expect(parse({ overflows: [] }, "pages")).toBeNull();
    expect(parse({ contrasts: [] }, "pages")).toBeNull();
    const { by: _by, ...noEdges } = overflow;
    expect(parse({ overflows: [noEdges], contrasts: [] }, "pages")).toBeNull();
    expect(
      parse({ overflows: [{ ...overflow, by: { bottom: "12" } }], contrasts: [] }, "pages"),
    ).toBeNull();
    const { fg: _fg, ...noColor } = contrast;
    expect(parse({ overflows: [], contrasts: [noColor] }, "pages")).toBeNull();
    const fill = { slug: "intro", step: "1", coverage: 0.5, rows: [0.5], columns: [0.5] };
    expect(parse({ overflows: [], contrasts: [], fills: [fill] }, "pages")).toMatchObject({
      fills: [fill],
    });
    expect(
      parse({ overflows: [], contrasts: [], fills: [{ ...fill, rows: ["0.5"] }] }, "pages"),
    ).toBeNull();
    expect(
      parse({ overflows: [], contrasts: [], fills: [{ ...fill, box: { left: 0 } }] }, "pages"),
    ).toBeNull();
    expect(parse({ motion }, "motion")).toBeNull();
    expect(
      parse(
        { motion: [{ label: "beat 1", frames: [{ ms: "0", path: "/f.png" }] }], sheets: [] },
        "motion",
      ),
    ).toBeNull();
    expect(parse({ motion: [{ frames: [] }], sheets: [] }, "motion")).toBeNull();
    expect(parse({ motion, sheets: ["/s.png", 3] }, "motion")).toBeNull();
    expect(parse([], "morph")).toBeNull();
    expect(parseVisualResponse("not json", "pages")).toBeNull();
    expect(parseVisualResponse("", "pdf")).toBeNull();
  });
});

describe("requirePlaywright", () => {
  test("answers with what the runner answers", async () => {
    const response = await requirePlaywright(request, async () => ({
      overflows: [],
      contrasts: [],
    }));
    expect(response.overflows).toEqual([]);
  });

  test("throws the install hint when the runner finds no Playwright", async () => {
    await expect(requirePlaywright(request, async () => null)).rejects.toMatchObject({
      name: "DekError",
      message: "Playwright is not installed",
      hint: PLAYWRIGHT_INSTALL,
    });
  });
});

describe("launchChromium", () => {
  const browser = { close: async () => {} } as unknown as Browser;

  /** A Chromium whose launches fail in turn with `failures`, and whose sandbox each one asked for. */
  function chromiumFailing(...failures: Array<string | undefined>) {
    const asked: Array<boolean | undefined> = [];
    const chromium = {
      launch: async (options?: { chromiumSandbox?: boolean }): Promise<Browser> => {
        const failure = failures[asked.length];
        asked.push(options?.chromiumSandbox);
        if (failure !== undefined) {
          throw new Error(failure);
        }
        return browser;
      },
    };
    return { chromium, asked };
  }

  test("launches with the sandbox, once, where it starts", async () => {
    const { chromium, asked } = chromiumFailing();
    expect(await launchChromium(chromium, "required")).toEqual({ browser });
    expect(asked).toEqual([true]);
  });

  test("where the sandbox cannot start, launches without it when preferred, and says why", async () => {
    const { chromium, asked } = chromiumFailing(SANDBOX_FAILED);
    expect(await launchChromium(chromium, "preferred")).toEqual({
      browser,
      unsandboxed: SANDBOX_REASON,
    });
    expect(asked).toEqual([true, undefined]);
  });

  test("launches nothing without the sandbox where it is required, and says why", async () => {
    const { chromium, asked } = chromiumFailing(SANDBOX_FAILED);
    expect(await launchChromium(chromium, "required")).toEqual({ unsandboxed: SANDBOX_REASON });
    expect(asked).toEqual([true]);
  });

  test("launches without the sandbox after any failure when preferred, in Chromium's words", async () => {
    const { chromium, asked } = chromiumFailing(ZYGOTE_FAILED);
    expect(await launchChromium(chromium, "preferred")).toEqual({
      browser,
      unsandboxed: ZYGOTE_REASON,
    });
    expect(asked).toEqual([true, undefined]);
  });

  test("launches nothing more after any failure where the sandbox is required", async () => {
    const { chromium, asked } = chromiumFailing(CHROMIUM_MISSING);
    expect(await launchChromium(chromium, "required")).toEqual({ unsandboxed: CHROMIUM_MISSING });
    expect(asked).toEqual([true]);
  });

  test("says both failures when the launch without the sandbox fails too", async () => {
    const { chromium, asked } = chromiumFailing(SANDBOX_FAILED, CHROMIUM_MISSING);
    expect(await launchChromium(chromium, "preferred")).toEqual({
      unsandboxed: SANDBOX_REASON,
      failed: CHROMIUM_MISSING,
    });
    expect(asked).toEqual([true, undefined]);
  });

  test("requires the sandbox when told anything but preferred", async () => {
    const { chromium, asked } = chromiumFailing(SANDBOX_FAILED);
    await launchChromium(chromium, "optional" as SandboxMode);
    expect(asked).toEqual([true]);
  });
});

// A worker gets the environment dek started in, so these change only what dek itself reads;
// tests/cli/shot.test.ts sets the worker's own.
describe("drawing where Chromium's sandbox cannot start", () => {
  const sandboxless = join(import.meta.dir, "..", "helpers", "fake-playwright-sandboxless.ts");

  // The spy holds stderr while the test runs.
  test.serial("draws the user's own pages, warns once, and keeps why for --json", async () => {
    takeUnsandboxed();
    const warn = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      await withEnv({ DEK_PLAYWRIGHT: sandboxless, DEK_ALLOW_UNSANDBOXED: undefined }, async () => {
        expect(await defaultPlaywrightRunner(request)).toMatchObject({ overflows: [] });
        expect(await defaultPlaywrightRunner(request)).toMatchObject({ overflows: [] });
      });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(
        `warning: Chromium drew without its sandbox, which did not start here: ${SANDBOX_REASON}`,
      );
      expect(takeUnsandboxed()).toEqual({
        unsandboxed: {
          reason: SANDBOX_REASON,
          hint: expect.stringContaining("DEK_ALLOW_UNSANDBOXED=1"),
        },
      });
      expect(takeUnsandboxed()).toEqual({});
    } finally {
      warn.mockRestore();
    }
  });

  test.serial("refuses a ref's pages, which it never drew", async () => {
    takeUnsandboxed();
    await withTempDir(async (dir) => {
      const screenshotPath = join(dir, "intro.png");
      await withEnv({ DEK_PLAYWRIGHT: sandboxless, DEK_ALLOW_UNSANDBOXED: undefined }, async () => {
        await expect(
          refPlaywrightRunner({
            ...request,
            pages: [{ html: "<html></html>", slug: "intro", step: "1", screenshotPath }],
          }),
        ).rejects.toMatchObject({
          name: "DekError",
          message: `Chromium did not start with its sandbox here, and a ref is drawn only inside it: ${SANDBOX_REASON}`,
          hint: expect.stringContaining(
            "if you accept running this ref's slide scripts without the sandbox, set DEK_ALLOW_UNSANDBOXED=1",
          ),
        });
      });
      expect(await Bun.file(screenshotPath).exists()).toBe(false);
      expect(takeUnsandboxed()).toEqual({});
    });
  });
});
