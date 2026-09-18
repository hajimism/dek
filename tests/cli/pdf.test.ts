import { describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

type PdfOk = {
  ok: true;
  out: string;
};

type ErrorJson = {
  ok: false;
  error: { hint?: string };
};

describe("dek pdf", () => {
  test("writes dist/<deck>.pdf and returns the path as JSON", async () => {
    await withTempProject(
      {
        decks: [{ name: "demo", slides: { intro: introHtml } }],
      },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["pdf", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_PLAYWRIGHT: fakePlaywright },
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<PdfOk>(result);
        expect(json.ok).toBe(true);
        expect(json.out).toBe(join(root, "dist", "demo.pdf"));
        expect(await Bun.file(json.out).exists()).toBe(true);
      },
    );
  });

  test("fails with a playwright install hint when the runner is missing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const result = await runDek(["pdf", "--json"], {
          cwd: join(root, "decks", "demo"),
          env: { DEK_PLAYWRIGHT: "/no/such/playwright" },
        });
        expect(result.exitCode).toBe(1);
        const json = jsonStdout<ErrorJson>(result);
        expect(json.error.hint).toContain("playwright install");
      },
    );
  });

  test("writes dist/<deck>.pdf for every deck from the project root", async () => {
    await withTempProject(
      {
        decks: [
          { name: "alpha", slides: { intro: introHtml } },
          { name: "beta", slides: { intro: introHtml } },
        ],
      },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        const result = await runDek(["pdf", "--json"], {
          cwd: root,
          env: { DEK_PLAYWRIGHT: fakePlaywright },
        });
        expect(result.exitCode).toBe(0);
        const json = jsonStdout<{ ok: true; outs: string[] }>(result);
        expect(json.outs).toEqual([
          join(root, "dist", "alpha.pdf"),
          join(root, "dist", "beta.pdf"),
        ]);
      },
    );
  });
});
