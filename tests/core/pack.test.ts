import { describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { packDeck } from "../../src/core/pack.ts";
import { parseRefSource, pickSnapshot, readPack, snapshotDigest } from "../../src/core/ref.ts";
import { withTempDir } from "../helpers/fs.ts";
import { withTempProject } from "../helpers/project.ts";

const talk = {
  name: "talk",
  slides: { intro: '<section class="slide"><h2>intro</h2></section>\n' },
  assets: { "chart.png": "png", ".DS_Store": "finder", "photos/.hidden/a.png": "x" },
};

async function deckFiles(root: string, name = "talk") {
  await mkdir(join(root, "decks", name, "dist"), { recursive: true });
  await writeFile(join(root, "decks", name, "dist", `${name}.html`), "built");
  await mkdir(join(root, "decks", name, ".cache", "shots"), { recursive: true });
  await writeFile(join(root, "decks", name, ".cache", "shots", "intro.png"), "cached");
  await mkdir(join(root, "decks", name, "voice"), { recursive: true });
  await writeFile(join(root, "decks", name, "voice", "voice.toml"), 'speaker = "1"\n');
}

function deck(root: string, name = "talk") {
  return { name, dir: join(root, "decks", name) };
}

describe("packDeck", () => {
  test("packs one deck as a project that holds only it, under a folder named for it", async () => {
    const toml = '[voice]\nengine = "http://voice.internal"\nspeaker = "1"\n';
    await withTempProject({ toml, decks: [talk] }, async (root) => {
      await deckFiles(root);
      await writeFile(join(root, "LICENSE"), "MIT");
      const bytes = await packDeck({ root }, deck(root));

      const entries = await new Bun.Archive(bytes).files();
      expect([...entries.keys()].every((path) => path.startsWith("talk/"))).toBe(true);
      const files = await readPack(bytes);
      expect([...files.keys()].sort()).toEqual([
        "LICENSE",
        "decks/talk/assets/chart.png",
        "decks/talk/script.md",
        "decks/talk/slides/intro.html",
        "decks/talk/theme.css",
        "dek.toml",
      ]);
      expect(await files.get("dek.toml")?.text()).toBe("");
      expect(await files.get("LICENSE")?.text()).toBe("MIT");
    });
  });

  test("a deck packed twice, or by hand with the same files, pins the same digest", async () => {
    await withTempProject({ decks: [talk] }, async (root) => {
      const packed = await readPack(await packDeck({ root }, deck(root)));
      const byHand: Record<string, Blob> = {};
      for (const [path, blob] of packed) {
        byHand[`by-hand/${path}`] = blob;
      }
      const tarred = await readPack(await new Bun.Archive(byHand, { compress: "gzip" }).bytes());
      const source = parseRefSource("file/talk");
      expect(await snapshotDigest(pickSnapshot(tarred, source))).toBe(
        await snapshotDigest(pickSnapshot(packed, source)),
      );
    });
  });

  test("refuses a deck whose name a ref cannot carry", async () => {
    await withTempProject({ decks: [{ name: "my talk" }] }, async (root) => {
      await expect(packDeck({ root }, deck(root, "my talk"))).rejects.toMatchObject({
        message: 'deck "my talk" cannot be read as a ref by that name',
        hint: expect.stringContaining("no space or @"),
      });
    });
  });

  test("refuses a deck larger than a ref keeps, before writing anything", async () => {
    await withTempProject(
      { decks: [{ ...talk, assets: { "big.bin": "x".repeat(2048) } }] },
      async (root) => {
        await expect(packDeck({ root }, deck(root), { maxBytes: 1024 })).rejects.toMatchObject({
          message: expect.stringContaining("larger than"),
          path: join(root, "decks", "talk"),
        });
      },
    );
  });

  test("refuses a symlink that leads out of the project", async () => {
    await withTempDir(async (outside) => {
      await writeFile(join(outside, "secret.png"), "secret");
      await withTempProject({ decks: [talk] }, async (root) => {
        await symlink(join(outside, "secret.png"), join(root, "decks", "talk", "assets", "s.png"));
        await expect(packDeck({ root }, deck(root))).rejects.toMatchObject({
          message: expect.stringContaining("leads outside the project"),
        });
      });
    });
  });

  test("a symlink to nothing names the file to fix", async () => {
    await withTempProject({ decks: [talk] }, async (root) => {
      const link = join(root, "decks", "talk", "assets", "gone.png");
      await symlink(join(root, "decks", "talk", "assets", "nowhere.png"), link);
      await expect(packDeck({ root }, deck(root))).rejects.toMatchObject({
        message: "decks/talk/assets/gone.png is missing",
        path: link,
      });
    });
  });
});
