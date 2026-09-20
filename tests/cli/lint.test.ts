import { describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakeRumdl = join(import.meta.dir, "..", "helpers", "fake-rumdl.ts");
const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

type LintOk = {
  ok: boolean;
  diagnostics: Array<{ id: string; message: string; path?: string }>;
  rumdl?: "ok" | "skipped";
};

async function withFakeRumdl(root: string, args: string[], extraEnv: Record<string, string> = {}) {
  await chmod(fakeRumdl, 0o755);
  return runDek(args, {
    cwd: join(root, "decks", "demo"),
    env: { DEK_RUMDL: fakeRumdl, ...extraEnv },
  });
}

describe("dek lint", () => {
  test("exits 0 with empty diagnostics when the deck is clean", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = await runDek(["lint", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<LintOk>(result);
        expect(json.ok).toBe(true);
        expect(json.diagnostics).toEqual([]);
      },
    );
  });

  test.skipIf(!Bun.which("rumdl"))("reports rumdl ok on a clean deck", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = await runDek(["lint", "--json"], { cwd: join(root, "decks", "demo") });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<LintOk>(result);
        expect(json.rumdl).toBe("ok");
        expect(json.diagnostics).toEqual([]);
      },
    );
  });

  test("exits 1 and reports DEK001 when a slide is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["lint", "--json"], { cwd: join(root, "decks", "demo") });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<LintOk>(result);
      expect(json.ok).toBe(false);
      expect(json.diagnostics.some((d) => d.id === "DEK001")).toBe(true);
    });
  });

  test("prints human-readable diagnostics without --json", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["lint"], { cwd: join(root, "decks", "demo") });
      expect(result.exitCode).toBe(1);
      expect(result.stdout.startsWith("{")).toBe(false);
      expect(result.stdout).toContain("DEK001");
    });
  });

  test("writes SARIF 2.1.0 with --format sarif", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["lint", "--format", "sarif"], {
        cwd: join(root, "decks", "demo"),
      });
      expect(result.exitCode).toBe(1);
      const sarif = JSON.parse(result.stdout) as {
        version?: string;
        runs?: Array<{ results?: Array<{ ruleId?: string }> }>;
      };
      expect(sarif.version).toBe("2.1.0");
      expect(sarif.runs?.[0]?.results?.some((r) => r.ruleId === "DEK001")).toBe(true);
    });
  });

  test("--fix creates a skeleton for DEK001 and leaves existing files alone", async () => {
    const leftover = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">keep me</h2>
</section>`);
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

## extra {#extra}

more
`,
            slides: { leftover },
          },
        ],
      },
      async (root) => {
        const deckDir = join(root, "decks", "demo");
        const result = await runDek(["lint", "--fix", "--json"], { cwd: deckDir });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<LintOk>(result);
        expect(json.diagnostics.some((d) => d.id === "DEK001")).toBe(false);

        const intro = await Bun.file(join(deckDir, "slides", "intro.html")).text();
        expect(intro).not.toContain("<!DOCTYPE html>");
        expect(intro.trimStart().startsWith('<section class="slide"')).toBe(true);
        expect(intro).toContain('<h2 class="slide-title">Demo</h2>');

        const extra = await Bun.file(join(deckDir, "slides", "extra.html")).text();
        expect(extra).toContain('<h2 class="slide-title"></h2>');

        expect(await Bun.file(join(deckDir, "slides", "leftover.html")).text()).toBe(leftover);
      },
    );
  });

  test("merges rumdl diagnostics into JSON and SARIF", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const jsonResult = await withFakeRumdl(root, ["lint", "--json"]);
        expect(jsonResult.exitCode).toBe(1);
        const json = jsonStdout<LintOk>(jsonResult);
        expect(json.diagnostics.some((d) => d.id === "MD013")).toBe(true);
        expect(json.diagnostics.some((d) => d.id === "DEK001")).toBe(false);

        const sarifResult = await withFakeRumdl(root, ["lint", "--format", "sarif"]);
        expect(sarifResult.exitCode).toBe(1);
        const sarif = JSON.parse(sarifResult.stdout) as {
          runs?: Array<{
            tool?: { driver?: { name?: string } };
            results?: Array<{ ruleId?: string }>;
          }>;
        };
        expect(sarif.runs?.map((run) => run.tool?.driver?.name)).toEqual(["dek", "rumdl"]);
        expect(sarif.runs?.[1]?.results?.some((r) => r.ruleId === "MD013")).toBe(true);
      },
    );
  });

  test("--fix does not pass --fix to rumdl", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const marker = join(root, "rumdl-fix");
        const result = await withFakeRumdl(root, ["lint", "--fix", "--json"], {
          RUMDL_FIX_MARKER: marker,
        });
        expect(result.exitCode).toBe(1);
        expect(await Bun.file(marker).exists()).toBe(false);
      },
    );
  });

  test("does not emit DEK030 without --visual", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["lint", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: {
            DEK_PLAYWRIGHT: fakePlaywright,
            DEK_PLAYWRIGHT_OVERFLOWS: JSON.stringify([{ slug: "intro", step: "1", box: "h2" }]),
          },
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<LintOk>(result);
        expect(json.diagnostics.some((d) => d.id === "DEK030")).toBe(false);
      },
    );
  });

  test("merges DEK030 from --visual via the playwright runner", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["lint", "--visual", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: {
            DEK_PLAYWRIGHT: fakePlaywright,
            DEK_PLAYWRIGHT_OVERFLOWS: JSON.stringify([{ slug: "intro", step: "1", box: "h2" }]),
          },
        });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<LintOk>(result);
        expect(json.diagnostics.some((d) => d.id === "DEK030")).toBe(true);
      },
    );
  });

  test("writes DEK030 into SARIF with --visual --format sarif", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["lint", "--visual", "--format", "sarif"], {
          cwd: join(root, "decks", "demo"),
          env: {
            DEK_PLAYWRIGHT: fakePlaywright,
            DEK_PLAYWRIGHT_OVERFLOWS: JSON.stringify([{ slug: "intro", step: "1", box: "h2" }]),
          },
        });
        expect(result.exitCode).toBe(1);
        const sarif = JSON.parse(result.stdout) as {
          runs?: Array<{ results?: Array<{ ruleId?: string }> }>;
        };
        expect(sarif.runs?.[0]?.results?.some((r) => r.ruleId === "DEK030")).toBe(true);
      },
    );
  });

  test("fails with a playwright install hint when --visual has no runner", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["lint", "--visual", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_PLAYWRIGHT: "/no/such/playwright" },
        });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<{ ok: false; error: { hint?: string } }>(result);
        expect(json.ok).toBe(false);
        expect(json.error.hint).toContain("playwright install");
      },
    );
  });

  test("marks rumdl as skipped when the binary is missing without failing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["lint", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_RUMDL: "/no/such/rumdl" },
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<LintOk>(result);
        expect(json.diagnostics).toEqual([]);
        expect(json.rumdl).toBe("skipped");
      },
    );
  });

  test("lints every deck from the project root", async () => {
    await withTempProject(
      {
        decks: [{ name: "alpha", slides: { intro: introHtml } }, { name: "beta" }],
      },
      async (root) => {
        const result = await runDek(["lint", "--json"], { cwd: root });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<LintOk>(result);
        expect(json.ok).toBe(false);
        expect(json.diagnostics.some((d) => d.id === "DEK001" && d.path?.includes("beta"))).toBe(
          true,
        );
        expect(json.diagnostics.some((d) => d.path?.includes("alpha"))).toBe(false);
      },
    );
  });

  test("scopes lint with a positional deck name", async () => {
    await withTempProject(
      {
        decks: [{ name: "alpha", slides: { intro: introHtml } }, { name: "beta" }],
      },
      async (root) => {
        const result = await runDek(["lint", "alpha", "--json"], { cwd: root });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<LintOk>(result);
        expect(json.ok).toBe(true);
        expect(json.diagnostics).toEqual([]);
      },
    );
  });

  test("fails when the positional deck name is missing", async () => {
    await withTempProject(
      { decks: [{ name: "alpha", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["lint", "nope", "--json"], { cwd: root });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<{ ok: false; error: { message?: string } }>(result);
        expect(json.error.message).toContain('deck "nope" not found');
      },
    );
  });
});
