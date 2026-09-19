import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { cacheDir, distDir, distFile, isInside, moduleFilePath } from "../../src/core/path.ts";
import { resolveDeck } from "../../src/core/resolve.ts";
import { withTempProject } from "../helpers/project.ts";

describe("moduleFilePath", () => {
  test("decodes a file URL the same way as fileURLToPath", () => {
    const url = "file:///tmp/playwright%20worker.ts";
    expect(moduleFilePath(url)).toBe(fileURLToPath(url));
    expect(moduleFilePath(url)).toBe("/tmp/playwright worker.ts");
  });

  test("accepts a URL object from import.meta.url", () => {
    const url = new URL("./playwright-worker.ts", import.meta.url);
    expect(moduleFilePath(url)).toBe(fileURLToPath(url));
  });
});

describe("isInside", () => {
  test("rejects paths that escape the root", () => {
    expect(isInside("/tmp/deck/assets/a.png", "/tmp/deck")).toBe(true);
    expect(isInside("/tmp/other/a.png", "/tmp/deck")).toBe(false);
  });
});

describe("distDir", () => {
  test("writes under the deck by default and under the project with rootDist", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const { project, deck } = resolveDeck(join(root, "decks", "demo"));
      expect(distDir(project, deck)).toBe(join(root, "decks", "demo", "dist"));
      expect(distDir(project, deck, { rootDist: true })).toBe(join(root, "dist"));
      expect(distFile(project, deck, "html")).toBe(
        join(root, "decks", "demo", "dist", "demo.html"),
      );
      expect(distFile(project, deck, "html", { rootDist: true })).toBe(
        join(root, "dist", "demo.html"),
      );
    });
  });
});

describe("cacheDir", () => {
  test("nests voice, video, and shots under the deck .cache", async () => {
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      expect(cacheDir(deckDir, "voice")).toBe(join(deckDir, ".cache", "voice"));
      expect(cacheDir(deckDir, "video")).toBe(join(deckDir, ".cache", "video"));
      expect(cacheDir(deckDir, "shots")).toBe(join(deckDir, ".cache", "shots"));
    });
  });
});
