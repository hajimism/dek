import { describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { shotCommand } from "../../src/cli/shot.ts";
import { DekError } from "../../src/core/error.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

type ShotOk = {
  ok: true;
  shots: Array<{ slug: string; step: string; path: string }>;
};

describe("dek shot", () => {
  test("writes a screenshot for one slug and returns its path", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["shot", "intro", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_PLAYWRIGHT: fakePlaywright },
        });
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
});

describe("shotCommand", () => {
  test("to needs a source slug and refuses step and a bad at", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const cwd = join(root, "decks", "demo");
        await expect(shotCommand({ cwd, to: "intro" })).rejects.toMatchObject({
          name: "DekError",
          hint: expect.stringContaining("dek shot <slug> --to <slug>"),
        });
        await expect(
          shotCommand({ cwd, slug: "intro", to: "intro", step: "1" }),
        ).rejects.toMatchObject({
          name: "DekError",
          hint: expect.stringContaining("--step"),
        });
        await expect(
          shotCommand({ cwd, slug: "intro", to: "intro", at: "2" }),
        ).rejects.toMatchObject({
          name: "DekError",
          hint: expect.stringContaining("0 and 1"),
        });
        await expect(shotCommand({ cwd, slug: "intro", at: "0.3" })).rejects.toMatchObject({
          name: "DekError",
          hint: expect.stringContaining("--to"),
        });
      },
    );
  });

  test.serial("fails with a playwright install hint when the runner is missing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withEnv({ DEK_PLAYWRIGHT: "/no/such/playwright" }, async () => {
          try {
            await shotCommand({ cwd: join(root, "decks", "demo"), slug: "intro" });
            throw new Error("expected DekError");
          } catch (error) {
            expect(error).toBeInstanceOf(DekError);
            expect((error as DekError).hint).toContain("playwright install");
          }
        });
      },
    );
  });
});
