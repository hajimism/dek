import { describe, expect, test } from "bun:test";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pptxCommand } from "../../src/cli/pptx.ts";
import { resolveDecks } from "../../src/cli/scope.ts";
import { formatPptx } from "../../src/cli/text.ts";
import { DekError } from "../../src/core/error.ts";
import type { PlaywrightRunner } from "../../src/core/playwright.ts";
import { pptxDeck } from "../../src/core/pptx.ts";
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

  test.serial("asks the worker for shapes only with --shapes", async () => {
    await withTempProject(
      { decks: [{ name: "demo", slides: { intro: introHtml } }] },
      async (root) => {
        const asked: unknown[] = [];
        const runner: PlaywrightRunner = async (request) => {
          asked.push(request.kind === "pptx" ? request.shapes : undefined);
          const pages = request.kind === "pptx" ? request.pages : [];
          for (const page of pages) {
            await writeFile(page.screenshotPath, "png");
          }
          return {
            slides: pages.map((page) => ({
              slug: page.slug,
              description: "",
              layers: [],
            })),
          } as never;
        };
        const dir = join(root, "decks", "demo");
        expect(await pptxDeck(dir, { runner })).not.toHaveProperty("lifted");
        // Nothing came out of the picture: the slide is named, to rewrite toward shapes.
        expect((await pptxDeck(dir, { runner, shapes: true })).lifted).toEqual({
          shapes: 0,
          pictures: 0,
          untouched: ["intro"],
        });
        expect(asked).toEqual([false, true]);
      },
    );
  });

  test("says what --shapes laid over each file's pictures, and where it laid nothing", () => {
    expect(formatPptx({ outs: ["a.pptx"] })).toBe("wrote a.pptx");
    expect(
      formatPptx({
        outs: ["a.pptx", "b.pptx"],
        lifted: [
          { shapes: 3, pictures: 1, untouched: [] },
          { shapes: 0, pictures: 0, untouched: ["cover", "close"] },
        ],
      }),
    ).toBe(
      [
        "wrote a.pptx",
        "  --shapes laid 3 shapes and 1 picture over the picture",
        "wrote b.pptx",
        "  --shapes laid 0 shapes and 0 pictures over the picture; nothing on cover, close",
      ].join("\n"),
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
