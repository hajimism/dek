import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { checkCommand } from "../../src/cli/check.ts";
import { requireDeckFromCwd } from "../../src/cli/scope.ts";
import { formatCheck } from "../../src/cli/text.ts";
import { DekError } from "../../src/core/error.ts";
import type { VisualRequest, VisualResponse } from "../../src/core/playwright.ts";
import { VOICE_SETUP_HINT } from "../../src/core/voice.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { writeRequested } from "../helpers/visual.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

/** Renders nothing wrong, so lint alone decides, without starting Chromium. */
async function cleanRunner(): Promise<VisualResponse> {
  return { overflows: [], contrasts: [] };
}

async function overflowRunner(request: VisualRequest): Promise<VisualResponse> {
  await writeRequested(request);
  return { overflows: [{ slug: "intro", step: "1", box: "h2", by: { bottom: 8 } }], contrasts: [] };
}

describe("dek check", () => {
  test("requires a slug", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["check", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result).toMatchObject({ exitCode: 1 });
        const json = jsonStdout<{ ok: false; error: { message: string; hint?: string } }>(result);
        expect(json.error.message).toBe("missing <slug> for dek check");
        expect(json.error.hint).toBe(
          "usage: dek check [deck] <slug> [--shot] [--voice]; run `dek help check`",
        );
      },
    );
  });

  test("prints diagnostics and the shot path without --json", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["check", "intro", "--shot"], {
          cwd: join(root, "decks", "demo"),
          env: {
            DEK_PLAYWRIGHT: fakePlaywright,
            DEK_PLAYWRIGHT_OVERFLOWS: JSON.stringify([{ slug: "intro", step: "1", box: "h2" }]),
          },
        });
        expect(result).toMatchObject({ exitCode: 1 });
        expect(result.stdout.startsWith("{")).toBe(false);
        expect(result.stdout).toContain("DEK030");
        expect(result.stdout).toContain(".cache/shots");
      },
    );
  });
});

describe("checkCommand", () => {
  test("reports only diagnostics for the requested slide", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## intro

hello

## extra

more
`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = await checkCommand(requireDeckFromCwd(join(root, "decks", "demo")), {
          slug: "intro",
          runner: cleanRunner,
        });
        expect(result.slug).toBe("intro");
        expect(result.diagnostics.some((d) => d.id === "DEK001")).toBe(false);
      },
    );
  });

  test("reports the slide's findings only; theme.css and the budget are dek lint's", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\nduration: 60m\n---\n\n## intro\n\nhello\n",
            theme: "body { color: #f00; }\n",
            styles: { intro: ".slide p { color: #f00; }\n" },
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = await checkCommand(requireDeckFromCwd(join(root, "decks", "demo")), {
          slug: "intro",
          runner: cleanRunner,
        });
        const found = result.diagnostics.map((d) => `${d.id} ${d.path?.split("/").at(-1)}`);
        expect(found).toContain("DEK014 intro.css");
        expect(found.filter((d) => d.includes("theme.css") || d.includes("DEK041"))).toEqual([]);
        expect(result.diagnostics.every((d) => d.slug === "intro")).toBe(true);
      },
    );
  });

  test("includes visual diagnostics when a playwright runner is available", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await checkCommand(requireDeckFromCwd(join(root, "decks", "demo")), {
          slug: "intro",
          runner: overflowRunner,
        });
        expect(result.diagnostics.some((d) => d.id === "DEK030")).toBe(true);
      },
    );
  });

  test("runs playwright once for visual and shot", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        let calls = 0;
        const result = await checkCommand(requireDeckFromCwd(join(root, "decks", "demo")), {
          slug: "intro",
          shot: true,
          runner: async (request: VisualRequest) => {
            calls += 1;
            return overflowRunner(request);
          },
        });
        expect(calls).toBe(1);
        expect(result.shot).toContain(".cache/shots/intro");
        expect(result.shot).toMatch(/intro~0\.[0-9a-f]{8}\.png$/);
        expect(await Bun.file(result.shot ?? "").exists()).toBe(true);
        expect(result.diagnostics.some((d) => d.id === "DEK030")).toBe(true);
      },
    );
  });

  test.serial("skips visual diagnostics when Playwright is not installed", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withEnv({ DEK_PLAYWRIGHT: "/no/such/playwright" }, async () => {
          const result = await checkCommand(requireDeckFromCwd(join(root, "decks", "demo")), {
            slug: "intro",
          });
          expect(result.diagnostics.some((d) => d.id === "DEK030")).toBe(false);
          expect(result.skipped).toEqual([
            {
              check: "visual",
              reason: "Playwright is not installed",
              hint: "bun add -d playwright && bunx playwright install chromium, then run `dek check intro` to measure overflow and contrast",
            },
          ]);
        });
      },
    );
  });

  test.serial("fails --shot without Playwright before making the shot cache", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withEnv({ DEK_PLAYWRIGHT: "/no/such/playwright" }, async () => {
          const deckDir = join(root, "decks", "demo");
          await expect(
            checkCommand(requireDeckFromCwd(deckDir), { slug: "intro", shot: true }),
          ).rejects.toThrow("Playwright is not installed");
          expect(existsSync(join(deckDir, ".cache", "shots"))).toBe(false);
        });
      },
    );
  });

  test.serial("fails when Playwright is installed but the worker exits non-zero", async () => {
    const fail = join(import.meta.dir, "..", "helpers", "fake-playwright-fail.ts");
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withEnv({ DEK_PLAYWRIGHT: fail }, async () => {
          try {
            await checkCommand(requireDeckFromCwd(join(root, "decks", "demo")), { slug: "intro" });
            throw new Error("expected DekError");
          } catch (error) {
            expect(error).toBeInstanceOf(DekError);
            expect((error as DekError).message.toLowerCase()).toContain("playwright");
          }
        });
      },
    );
  });

  test.serial(
    "--voice on a deck without voice skips the voice check and says how to set it up",
    async () => {
      await withTempProject(
        { decks: [{ name: "demo", slides: { intro: introHtml } }] },
        async (root) => {
          await withEnv({ DEK_PLAYWRIGHT: "/no/such/playwright" }, async () => {
            const result = await checkCommand(requireDeckFromCwd(join(root, "decks", "demo")), {
              slug: "intro",
              voice: true,
            });
            expect(result.voice).toBeUndefined();
            expect(result.skipped?.find((entry) => entry.check === "voice")).toEqual({
              check: "voice",
              reason: "the deck has no voice/voice.toml",
              hint: VOICE_SETUP_HINT,
            });
          });
        },
      );
    },
  );
});

// What an agent otherwise opens a screenshot to see: whether the slide is sparse, and where.
describe("dek check fill", () => {
  const rows = [0.9, 0.8, 0.6, 0.2, 0, 0, 0, 0, 0, 0];
  const columns = [0.4, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.3, 0];
  const box = { left: 0.04, top: 0.06, right: 0.96, bottom: 0.4 };

  async function fillRunner(request: VisualRequest): Promise<VisualResponse> {
    const pages = request.kind === "pages" ? request.pages : [];
    return {
      overflows: [],
      contrasts: [],
      fills: pages.map(({ slug, step }) => ({ slug, step, coverage: 0.25, box, rows, columns })),
    };
  }

  test("gives how much of the frame the slide fills at its last beat", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await checkCommand(requireDeckFromCwd(join(root, "decks", "demo")), {
          slug: "intro",
          runner: fillRunner,
        });
        expect(result.fill).toEqual({ step: "0", coverage: 0.25, box, rows, columns });
      },
    );
  });

  test("gives no fill when the slide could not be measured", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await checkCommand(requireDeckFromCwd(join(root, "decks", "demo")), {
          slug: "intro",
          runner: cleanRunner,
        });
        expect(result.fill).toBeUndefined();
      },
    );
  });

  test("prints the fill as percentages, with the bands top to bottom and left to right", () => {
    const text = formatCheck({
      slug: "intro",
      diagnostics: [],
      fill: { step: "0", coverage: 0.25, box, rows, columns },
    });
    expect(text.split("\n").slice(-3)).toEqual([
      "fill: 25% of the frame, within left 4% top 6% right 96% bottom 40%",
      "  rows, top to bottom:    90 80 60 20 0 0 0 0 0 0",
      "  columns, left to right: 40 50 50 50 50 50 50 50 30 0",
    ]);
  });

  test("says when nothing on the slide fills the frame", () => {
    const empty = Array.from({ length: 10 }, () => 0);
    const text = formatCheck({
      slug: "intro",
      diagnostics: [],
      fill: { step: "0", coverage: 0, rows: empty, columns: empty },
    });
    expect(text.split("\n").at(-1)).toBe("fill: nothing to read or look at on the slide");
  });
});
