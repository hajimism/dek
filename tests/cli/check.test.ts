import { describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { checkCommand } from "../../src/cli/check.ts";
import type { VisualRequest } from "../../src/core/playwright.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

type CheckOk = {
  ok: boolean;
  slug: string;
  diagnostics: Array<{ id: string; message: string; path?: string }>;
  shot?: string;
  visual?: "ok" | "skipped";
};

describe("dek check", () => {
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
        const result = await runDek(["check", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<CheckOk>(result);
        expect(json.slug).toBe("intro");
        expect(json.diagnostics.some((d) => d.id === "DEK001")).toBe(false);
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
        const result = await runDek(["check", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
        });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<CheckOk>(result);
        expect(json.ok).toBe(false);
        expect(json.diagnostics.some((d) => d.id === "DEK012")).toBe(true);
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
        const result = await runDek(["check", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
        });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<CheckOk>(result);
        expect(json.diagnostics.some((d) => d.id === "DEK014")).toBe(true);
        expect(json.diagnostics.some((d) => d.id === "DEK015")).toBe(true);
      },
    );
  });

  test("includes visual diagnostics when a playwright runner is available", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["check", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: {
            DEK_PLAYWRIGHT: fakePlaywright,
            DEK_PLAYWRIGHT_OVERFLOWS: JSON.stringify([{ slug: "intro", step: "1", box: "h2" }]),
          },
        });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<CheckOk>(result);
        expect(json.ok).toBe(false);
        expect(json.diagnostics.some((d) => d.id === "DEK030")).toBe(true);
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
          },
        });
        expect(calls).toBe(1);
        expect(result.shot).toContain(".cache/shots/intro");
        expect(result.diagnostics.some((d) => d.id === "DEK030")).toBe(true);
      },
    );
  });

  test("writes a screenshot path with --shot", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["check", "intro", "--shot", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_PLAYWRIGHT: fakePlaywright },
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<CheckOk>(result);
        expect(json.shot).toContain(".cache/shots/intro");
        expect(json.shot).toMatch(/intro\.[0-9a-f]{8}\.png$/);
        expect(await Bun.file(json.shot ?? "").exists()).toBe(true);
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

  test("requires a slug", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["check", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<{ ok: false; error: { hint?: string } }>(result);
        expect(json.error.hint).toContain("dek check <slug>");
      },
    );
  });

  test("skips visual diagnostics when Playwright is not installed", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["check", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_PLAYWRIGHT: "/no/such/playwright" },
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<CheckOk>(result);
        expect(json.diagnostics.some((d) => d.id === "DEK030")).toBe(false);
        expect(json.visual).toBe("skipped");
      },
    );
  });

  test("fails when Playwright is installed but the worker exits non-zero", async () => {
    const fail = join(import.meta.dir, "..", "helpers", "fake-playwright-fail.ts");
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["check", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_PLAYWRIGHT: fail },
        });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<{ ok: false; error: { message: string } }>(result);
        expect(json.error.message.toLowerCase()).toContain("playwright");
      },
    );
  });
});
