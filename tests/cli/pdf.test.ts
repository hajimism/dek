import { describe, expect, test } from "bun:test";
import { chmod } from "node:fs/promises";
import { join } from "node:path";
import { pdfCommand } from "../../src/cli/pdf.ts";
import { DekError } from "../../src/core/error.ts";
import { jsonStdout, runDek } from "../helpers/cli.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

type PdfOk = {
  ok: true;
  outs: string[];
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
        expect(json.outs).toEqual([join(root, "decks", "demo", "dist", "demo.pdf")]);
        expect(await Bun.file(json.outs[0] ?? "").exists()).toBe(true);
      },
    );
  });
});

describe("pdfCommand", () => {
  test.serial("fails with a playwright install hint when the runner is missing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withEnv({ DEK_PLAYWRIGHT: "/no/such/playwright" }, async () => {
          try {
            await pdfCommand({ cwd: join(root, "decks", "demo") });
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
