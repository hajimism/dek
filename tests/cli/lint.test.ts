import { describe, expect, test } from "bun:test";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { lintCommand } from "../../src/cli/lint.ts";
import { mergeSarif, toSarif } from "../../src/core/sarif.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakeRumdl = join(import.meta.dir, "..", "helpers", "fake-rumdl.ts");
const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

type LintOk = {
  ok: boolean;
  diagnostics: Array<{
    id: string;
    message: string;
    path?: string;
    line?: number;
    severity?: string;
    data?: Record<string, unknown>;
  }>;
  error?: { message: string; hint?: string };
  skipped?: Array<{ check: string; reason: string; hint?: string }>;
};

describe("dek lint", () => {
  test("exits 1 and reports DEK001 when a slide is missing", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["lint", "--json"], { cwd: join(root, "decks", "demo") });
      expect(result.exitCode).toBe(1);
      const json = jsonStdout<LintOk>(result);
      expect(json.ok).toBe(false);
      expect(json.diagnostics.some((d) => d.id === "DEK001")).toBe(true);
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

  test("passes with warnings only and labels each diagnostic's severity", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n\nこんにちは、AI です。\n",
            slides: { intro: introHtml },
          },
        ],
      },
      async (root) => {
        const deck = join(root, "decks", "demo");
        await mkdir(join(deck, "voice"), { recursive: true });
        await writeFile(join(deck, "voice", "voice.toml"), 'engine = "voicevox"\nspeaker = "a"\n');
        const result = await runDek(["lint", "--json"], { cwd: deck });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<LintOk>(result);
        expect(json.ok).toBe(true);
        expect(json.diagnostics.map((d) => [d.id, d.severity])).toEqual([["DEK040", "warning"]]);
      },
    );
  });

  test("fails when an error sits next to warnings", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: "---\ntitle: Demo\n---\n\n## intro\n\nこんにちは、AI です。\n",
          },
        ],
      },
      async (root) => {
        const deck = join(root, "decks", "demo");
        await mkdir(join(deck, "voice"), { recursive: true });
        await writeFile(join(deck, "voice", "voice.toml"), 'engine = "voicevox"\nspeaker = "a"\n');
        const result = await runDek(["lint", "--json"], { cwd: deck });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<LintOk>(result);
        expect(json.ok).toBe(false);
        expect(json.diagnostics.find((d) => d.id === "DEK001")?.severity).toBe("error");
      },
    );
  });

  test("writes a SARIF level for every dek result", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const result = await runDek(["lint", "--format", "sarif"], {
        cwd: join(root, "decks", "demo"),
      });
      const sarif = JSON.parse(result.stdout) as {
        runs: Array<{ results: Array<{ ruleId: string; level?: string }> }>;
      };
      expect(sarif.runs[0]?.results.find((r) => r.ruleId === "DEK001")?.level).toBe("error");
    });
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
});

describe("lintCommand", () => {
  test("returns empty diagnostics when the deck is clean", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = await lintCommand({ cwd: join(root, "decks", "demo") });
        expect(result.diagnostics).toEqual([]);
      },
    );
  });

  test.skipIf(!Bun.which("rumdl"))("reports rumdl ok on a clean deck", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        const result = await lintCommand({ cwd: join(root, "decks", "demo") });
        expect(result.skipped).toBeUndefined();
        expect(result.diagnostics).toEqual([]);
      },
    );
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
        const result = await lintCommand({ cwd: deckDir, fix: true });
        expect(result.diagnostics.some((d) => d.id === "DEK001")).toBe(false);

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

  test.serial("merges rumdl diagnostics into JSON and SARIF", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await chmod(fakeRumdl, 0o755);
        await withEnv({ DEK_RUMDL: fakeRumdl }, async () => {
          const result = await lintCommand({ cwd: join(root, "decks", "demo") });
          expect(result.diagnostics.some((d) => d.id === "MD013")).toBe(true);
          expect(result.diagnostics.some((d) => d.id === "DEK001")).toBe(false);
          const sarif = mergeSarif(
            toSarif(result.diagnostics.filter((d) => d.id.startsWith("DEK"))),
            result.rumdlSarif,
          );
          expect(sarif.runs.map((run) => run.tool.driver.name)).toEqual(["dek", "rumdl"]);
          expect(sarif.runs[1]?.results.some((r) => r.ruleId === "MD013")).toBe(true);
        });
      },
    );
  });

  test.serial("--fix does not pass --fix to rumdl", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await chmod(fakeRumdl, 0o755);
        const marker = join(root, "rumdl-fix");
        await withEnv({ DEK_RUMDL: fakeRumdl, RUMDL_FIX_MARKER: marker }, async () => {
          await lintCommand({ cwd: join(root, "decks", "demo"), fix: true });
          expect(await Bun.file(marker).exists()).toBe(false);
        });
      },
    );
  });

  test("does not emit DEK030 without visual", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await lintCommand({ cwd: join(root, "decks", "demo") });
        expect(result.diagnostics.some((d) => d.id === "DEK030")).toBe(false);
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

  test.serial("marks rumdl as skipped when the binary is missing without failing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withEnv({ DEK_RUMDL: "/no/such/rumdl" }, async () => {
          const result = await lintCommand({ cwd: join(root, "decks", "demo") });
          expect(result.diagnostics).toEqual([]);
          expect(result.skipped).toEqual([
            {
              check: "rumdl",
              reason: "rumdl is not installed",
              hint: "bun add -d rumdl; or put rumdl on PATH, or set DEK_RUMDL to its path",
            },
          ]);
        });
      },
    );
  });

  test("lints every deck from the project root", async () => {
    await withTempProject(
      {
        decks: [{ name: "alpha", slides: { intro: introHtml } }, { name: "beta" }],
      },
      async (root) => {
        const result = await lintCommand({ cwd: root });
        expect(result.diagnostics.some((d) => d.id === "DEK001" && d.path?.includes("beta"))).toBe(
          true,
        );
        expect(result.diagnostics.some((d) => d.path?.includes("alpha"))).toBe(false);
      },
    );
  });

  test("fails when the named deck is missing", async () => {
    await withTempProject(
      { decks: [{ name: "alpha", slides: { intro: introHtml } }] },
      async (root) => {
        await expect(lintCommand({ cwd: root, deck: "nope" })).rejects.toMatchObject({
          name: "DekError",
          message: expect.stringContaining('deck "nope" not found'),
        });
      },
    );
  });
});
