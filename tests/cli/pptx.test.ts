import { describe, expect, test } from "bun:test";
import { chmod, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pptxCommand } from "../../src/cli/pptx.ts";
import { resolveDecks } from "../../src/cli/scope.ts";
import { DekError } from "../../src/core/error.ts";
import { withEnv } from "../helpers/env.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";
import { readZip } from "../helpers/zip.ts";

const introHtml = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
</section>`);

const fakePlaywright = join(import.meta.dir, "..", "helpers", "fake-playwright.ts");

describe("pptxCommand", () => {
  test.serial("writes dist/<deck>.pptx for each deck, with the script in the notes", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await chmod(fakePlaywright, 0o755);
        await withEnv({ DEK_PLAYWRIGHT: fakePlaywright }, async () => {
          const result = await pptxCommand(resolveDecks(join(root, "decks", "demo")));
          const out = join(root, "decks", "demo", "dist", "demo.pptx");
          expect(result).toEqual({ outs: [out] });
          const files = readZip(new Uint8Array(await readFile(out)));
          expect(new TextDecoder().decode(files.get("ppt/notesSlides/notesSlide1.xml"))).toContain(
            "hello",
          );
          const rooted = await pptxCommand(resolveDecks(root), { rootDist: true });
          expect(rooted.outs).toEqual([join(root, "dist", "demo.pptx")]);
        });
      },
    );
  });

  test.serial("fails with a playwright install hint when the runner is missing", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        await withEnv({ DEK_PLAYWRIGHT: "/no/such/playwright" }, async () => {
          let error: unknown;
          try {
            await pptxCommand(resolveDecks(join(root, "decks", "demo")));
          } catch (caught) {
            error = caught;
          }
          expect(error).toBeInstanceOf(DekError);
          expect((error as DekError).hint).toContain("playwright install");
        });
      },
    );
  });
});
