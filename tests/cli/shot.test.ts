import { describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const architectureHtml = slideDocument(`<section class="slide" data-layout="default">
  <h2 class="slide-title">architecture</h2>
  <ul>
    <li data-step="script-parent">script.md が親</li>
    <li data-step="slides-hang">スライドがぶら下がる</li>
  </ul>
</section>`);

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

type ShotOk = {
  ok: true;
  shots: Array<{ slug: string; step: string; path: string }>;
};

type ErrorJson = {
  ok: false;
  error: { hint?: string };
};

async function withFakePlaywright(root: string, args: string[]) {
  await chmod(fakePlaywright, 0o755);
  return runDek(args, {
    cwd: join(root, "decks", "demo"),
    env: { DEK_PLAYWRIGHT: fakePlaywright },
  });
}

describe("dek shot", () => {
  test("writes a screenshot for one slug and returns its path", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await withFakePlaywright(root, ["shot", "intro", "--json"]);
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<ShotOk>(result);
        expect(json.ok).toBe(true);
        expect(json.shots).toHaveLength(1);
        expect(json.shots[0]?.slug).toBe("intro");
        expect(json.shots[0]?.path).toContain(".cache/shots/intro");
        expect(await Bun.file(json.shots[0]?.path ?? "").exists()).toBe(true);
      },
    );
  });

  test("shots every slide at the last step when slug is omitted", async () => {
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

## architecture

### script-parent

first

### slides-hang

second
`,
            slides: { intro: introHtml, architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const result = await withFakePlaywright(root, ["shot", "--json"]);
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<ShotOk>(result);
        expect(json.shots.map((shot) => shot.slug).sort()).toEqual(["architecture", "intro"]);
        expect(json.shots.find((shot) => shot.slug === "architecture")?.step).toBe("slides-hang");
      },
    );
  });

  test("selects a beat with --step", async () => {
    await withTempProject(
      {
        decks: [
          {
            name: "demo",
            script: `---
title: Demo
---

## architecture

### script-parent

first

### slides-hang

second
`,
            slides: { architecture: architectureHtml },
          },
        ],
      },
      async (root) => {
        const result = await withFakePlaywright(root, [
          "shot",
          "architecture",
          "--step",
          "script-parent",
          "--json",
        ]);
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<ShotOk>(result);
        expect(json.shots[0]?.slug).toBe("architecture");
        expect(json.shots[0]?.step).toBe("script-parent");
        expect(json.shots[0]?.path).toContain("architecture");
      },
    );
  });

  test("shots a positional deck from the project root", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", slides: { intro: introHtml } },
          { name: "beta", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["shot", "beta", "--json"], {
          cwd: root,
          env: { DEK_PLAYWRIGHT: fakePlaywright },
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<ShotOk>(result);
        expect(json.shots).toHaveLength(1);
        expect(json.shots[0]?.slug).toBe("intro");
        expect(json.shots[0]?.path).toContain(`${join("decks", "beta")}`);
      },
    );
  });

  test("fails with a playwright install hint when the runner is missing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["shot", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_PLAYWRIGHT: "/no/such/playwright" },
        });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<ErrorJson>(result);
        expect(json.error.hint).toContain("playwright install");
      },
    );
  });
});
