import { describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DekcError } from "../../src/core/error.ts";
import {
  defaultPlaywrightRunner,
  type PagesRequest,
  PLAYWRIGHT_INSTALL,
  parseVisualResponse,
  playwrightMissingError,
  playwrightResolved,
  requirePlaywright,
  resolvePlaywrightModule,
  type VisualRequest,
} from "../../src/core/playwright.ts";
import { withEnv } from "../helpers/env.ts";
import { withTempDir } from "../helpers/fs.ts";

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

const request: PagesRequest = {
  kind: "pages",
  viewport: { width: 1280, height: 720 },
  actions: ["overflow"],
  pages: [{ html: "<html></html>", slug: "intro", step: "1" }],
};

describe("defaultPlaywrightRunner", () => {
  test("returns null when the runner is missing", async () => {
    await withEnv({ DEKC_PLAYWRIGHT: "/no/such/playwright" }, async () => {
      expect(playwrightResolved()).toBe(false);
      expect(await defaultPlaywrightRunner(request)).toBeNull();
    });
  });

  test("returns null quickly when the playwright package is not installed", async () => {
    await withEnv({ DEKC_PLAYWRIGHT: undefined }, async () => {
      if (!playwrightResolved()) {
        const started = Date.now();
        expect(await defaultPlaywrightRunner(request)).toBeNull();
        expect(Date.now() - started).toBeLessThan(1000);
      }
    });
  });

  test("returns JSON from DEKC_PLAYWRIGHT stdin/stdout", async () => {
    await chmod(fakePlaywright, 0o755);
    await withEnv({ DEKC_PLAYWRIGHT: fakePlaywright }, async () => {
      const response = await defaultPlaywrightRunner(request);
      expect(response).toEqual({
        overflows: [],
        contrasts: [],
        drawErrors: [],
        collisions: [],
        fills: [],
      });
    });
  });

  test("writes the pdfPath a pdf request names", async () => {
    await chmod(fakePlaywright, 0o755);
    await withTempDir(async (dir) => {
      const pdfPath = join(dir, "demo.pdf");
      await withEnv({ DEKC_PLAYWRIGHT: fakePlaywright }, async () => {
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
    "fails when the worker runs past timeoutMs, so a hung browser cannot hang dekc",
    async () => {
      const slow = join(import.meta.dir, "..", "helpers", "fake-playwright-slow.ts");
      await withEnv({ DEKC_PLAYWRIGHT: slow }, async () => {
        await expect(defaultPlaywrightRunner(request, { timeoutMs: 20 })).rejects.toMatchObject({
          name: "DekcError",
          message: "Playwright worker failed",
          hint: expect.stringContaining("did not finish"),
        });
      });
    },
  );

  test.serial("throws when an installed worker exits non-zero", async () => {
    const fail = join(import.meta.dir, "..", "helpers", "fake-playwright-fail.ts");
    await withEnv({ DEKC_PLAYWRIGHT: fail }, async () => {
      await expect(defaultPlaywrightRunner(request)).rejects.toMatchObject({
        name: "DekcError",
        message: "Playwright worker failed",
      });
    });
  });

  test.serial("throws when spawn fails for a resolved runner", async () => {
    await withEnv(
      { DEKC_PLAYWRIGHT: join(import.meta.dir, "missing-playwright-worker.ts") },
      async () => {
        expect(playwrightResolved()).toBe(true);
        await expect(defaultPlaywrightRunner(request)).rejects.toBeInstanceOf(DekcError);
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
      const nested = join(dir, "decks", "why-dekc");
      await mkdir(nested, { recursive: true });
      const cwd = process.cwd();
      await withEnv({ DEKC_PLAYWRIGHT: undefined }, async () => {
        try {
          process.chdir(nested);
          // It resolves from dekc's own install, as `bun add -d playwright` beside dekc puts it.
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
    ).toEqual({ overflows: [], contrasts: [], drawErrors: [], collisions: [], fills: [] });
    expect(parse({ motion, sheets: [], overflows: [] }, "motion")).toEqual({ motion, sheets: [] });
    expect(parse({ pdfPath: "/a.pdf" }, "pdf")).toEqual({});
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
      name: "DekcError",
      message: "Playwright is not installed",
      hint: PLAYWRIGHT_INSTALL,
    });
  });
});
