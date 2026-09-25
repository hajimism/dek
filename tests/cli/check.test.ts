import { describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { checkCommand } from "../../src/cli/check.ts";
import { DekError } from "../../src/core/error.ts";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { VOICE_SETUP_HINT } from "../../src/core/voice.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

async function overflowRunner(request: VisualRequest) {
  for (const page of request.pages) {
    if (page.screenshotPath) {
      await Bun.write(page.screenshotPath, "");
    }
  }
  return {
    overflows: [{ slug: "intro", step: "1", box: "h2" }],
    contrasts: [],
    screenshotPath: request.pages.find((page) => page.screenshotPath)?.screenshotPath,
  };
}

describe("dek check", () => {
  test("requires a slug", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["check", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<{ ok: false; error: { message: string; hint?: string } }>(result);
        expect(json.error.message).toBe("usage: dek check <slug>");
        expect(json.error.hint).toBe("run `dek ls` to see the slugs");
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
        expect(result.exitCode).toBe(1);
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
        const result = await checkCommand({
          cwd: join(root, "decks", "demo"),
          slug: "intro",
        });
        expect(result.slug).toBe("intro");
        expect(result.diagnostics.some((d) => d.id === "DEK001")).toBe(false);
      },
    );
  });

  test("keeps theme diagnostics that affect the slide", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: "body { color: red; }\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = await checkCommand({
          cwd: join(root, "decks", "demo"),
          slug: "intro",
        });
        expect(result.diagnostics.some((d) => d.id === "DEK012")).toBe(true);
      },
    );
  });

  test("keeps DEK014 and DEK015 theme diagnostics", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            theme: `.slide { color: #f00; }\n`,
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const result = await checkCommand({
          cwd: join(root, "decks", "demo"),
          slug: "intro",
        });
        expect(result.diagnostics.some((d) => d.id === "DEK014")).toBe(true);
        expect(result.diagnostics.some((d) => d.id === "DEK015")).toBe(true);
      },
    );
  });

  test("includes visual diagnostics when a playwright runner is available", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await checkCommand({
          cwd: join(root, "decks", "demo"),
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
        const result = await checkCommand({
          cwd: join(root, "decks", "demo"),
          slug: "intro",
          shot: true,
          runner: async (request: VisualRequest) => {
            calls += 1;
            return overflowRunner(request);
          },
        });
        expect(calls).toBe(1);
        expect(result.shot).toContain(".cache/shots/intro");
        expect(result.shot).toMatch(/intro\.[0-9a-f]{8}\.png$/);
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
          const result = await checkCommand({
            cwd: join(root, "decks", "demo"),
            slug: "intro",
          });
          expect(result.diagnostics.some((d) => d.id === "DEK030")).toBe(false);
          expect(result.skipped).toEqual([
            {
              check: "visual",
              reason: "Playwright is not installed",
              hint: "bun add -d playwright && bunx playwright install chromium to also check overflow and contrast",
            },
          ]);
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
            await checkCommand({ cwd: join(root, "decks", "demo"), slug: "intro" });
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
            const result = await checkCommand({
              cwd: join(root, "decks", "demo"),
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
