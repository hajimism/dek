import { describe, expect, test } from "bun:test";
import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  classifyAssetRef,
  inlineAssets,
  inlineCssUrls,
  isCanonicalAssetPath,
} from "../../src/core/assets.ts";
import { scanSlideHtml } from "../../src/core/html.ts";
import { lintDeck } from "../../src/core/index.ts";
import { withTempDir } from "../helpers/fs.ts";
import { slideDocument } from "../helpers/html.ts";
import { withTempProject } from "../helpers/project.ts";

async function deckWith(root: string, files: string[]): Promise<string> {
  const deckDir = join(root, "decks", "demo");
  for (const file of files) {
    await mkdir(join(deckDir, file, ".."), { recursive: true });
    await writeFile(join(deckDir, file), "x");
  }
  return deckDir;
}

describe("classifyAssetRef", () => {
  test("resolves against the deck root first, as the dev server and the build do", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/a.png", "slides/assets/a.png"]);
      const from = join(deckDir, "slides");
      expect(classifyAssetRef("assets/a.png", { deckDir, from })).toEqual({
        kind: "file",
        path: join(deckDir, "assets", "a.png"),
        deckPath: "assets/a.png",
      });
    });
  });

  test("falls back to the directory of the file that names it", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/a.png"]);
      const from = join(deckDir, "slides");
      expect(classifyAssetRef("../assets/a.png", { deckDir, from })).toMatchObject({
        kind: "file",
        deckPath: "assets/a.png",
      });
    });
  });

  test("ignores a query string or fragment when looking for the file", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/a.svg"]);
      const from = join(deckDir, "slides");
      expect(classifyAssetRef("assets/a.svg?v=2", { deckDir, from })).toMatchObject({
        kind: "file",
        deckPath: "assets/a.svg",
      });
      expect(classifyAssetRef("assets/a.svg#icon", { deckDir, from })).toMatchObject({
        kind: "file",
      });
    });
  });

  test("tells remote, escaping, missing, and nothing-to-check apart", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/a.png"]);
      const from = join(deckDir, "slides");
      const kind = (value: string) => classifyAssetRef(value, { deckDir, from }).kind;
      expect(kind("https://cdn.example.com/a.png")).toBe("remote");
      expect(kind("//cdn.example.com/a.png")).toBe("remote");
      expect(kind("../../secret.png")).toBe("escape");
      expect(kind("assets/missing.png")).toBe("missing");
      for (const value of ["", "   ", "#top", "data:image/png;base64,AAAA", "mailto:x@y.z"]) {
        expect(kind(value)).toBe("skip");
      }
    });
  });
});

describe("a symlink in the deck", () => {
  /** A deck whose `assets/` holds a link to a file outside it, the way `ln -s /etc/passwd` would. */
  async function withEscapingLink(
    fn: (paths: { root: string; deckDir: string }) => Promise<void>,
  ): Promise<void> {
    const slide = slideDocument(`<section class="slide" data-layout="title">
  <h2 class="slide-title">intro</h2>
  <img src="assets/p.png" alt="">
</section>`);
    await withTempProject({ decks: [{ name: "demo", slides: { intro: slide } }] }, async (root) => {
      const deckDir = join(root, "decks", "demo");
      await writeFile(join(root, "secret.txt"), "top secret\n");
      await symlink(join(root, "secret.txt"), join(deckDir, "assets", "p.png"));
      await fn({ root, deckDir });
    });
  }

  test("that leads outside the deck escapes it, wherever the link itself sits", async () => {
    await withEscapingLink(async ({ deckDir }) => {
      const from = join(deckDir, "slides");
      expect(classifyAssetRef("assets/p.png", { deckDir, from }).kind).toBe("escape");
    });
  });

  test("that leads outside the deck is never inlined into the build", async () => {
    await withEscapingLink(async ({ deckDir }) => {
      const secret = Buffer.from("top secret\n").toString("base64");
      expect(inlineAssets('<img src="assets/p.png">', deckDir)).toBe('<img src="assets/p.png">');
      expect(inlineCssUrls("a{background:url(assets/p.png)}", deckDir)).not.toContain(secret);
    });
  });

  test("that leads outside the deck is DEK022 in lint", async () => {
    await withEscapingLink(async ({ deckDir }) => {
      const diagnostics = lintDeck(deckDir);
      expect(diagnostics.filter((d) => d.id === "DEK022")).toMatchObject([
        { message: 'path "assets/p.png" is outside the deck directory' },
      ]);
    });
  });

  test("that stays inside the deck resolves like the file it names", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/real.png"]);
      await symlink(join(deckDir, "assets", "real.png"), join(deckDir, "assets", "alias.png"));
      expect(
        classifyAssetRef("assets/alias.png", { deckDir, from: join(deckDir, "slides") }),
      ).toMatchObject({ kind: "file", deckPath: "assets/alias.png" });
    });
  });

  test("under a deck reached through a symlinked directory still counts as inside", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/a.png"]);
      await symlink(deckDir, join(root, "linked"));
      const linked = join(root, "linked");
      expect(
        classifyAssetRef("assets/a.png", { deckDir: linked, from: join(linked, "slides") }).kind,
      ).toBe("file");
    });
  });
});

describe("isCanonicalAssetPath", () => {
  test("only deck-relative assets/ paths are canonical; non-paths pass", () => {
    expect(isCanonicalAssetPath("assets/a.png")).toBe(true);
    expect(isCanonicalAssetPath(" assets/a.png ")).toBe(true);
    expect(isCanonicalAssetPath("../assets/a.png")).toBe(false);
    expect(isCanonicalAssetPath("a.png")).toBe(false);
    for (const value of ["", "#top", "data:image/png;base64,AAAA", "https://x.y/a.png"]) {
      expect(isCanonicalAssetPath(value)).toBe(true);
    }
  });
});

describe("inlineAssets", () => {
  /** What a file holding "x" becomes, as `mime` says it is. */
  const x = (mime: string) => `data:${mime};base64,${Buffer.from("x").toString("base64")}`;

  test("inlines every attribute lint checks for a resource, not only src", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, [
        "assets/a.png",
        "assets/a@2x.png",
        "assets/a.mp4",
        "assets/a.webm",
        "assets/a.vtt",
        "assets/c.svg",
      ]);
      const html = `<section class="slide">
  <img srcset="assets/a.png 1x, assets/a@2x.png 2x" src="assets/a.png" alt="">
  <video src="assets/a.mp4" poster="assets/a.png"><source src="assets/a.webm"><track src="assets/a.vtt"></video>
  <object data="assets/c.svg"></object>
  <svg><image href="assets/a.png"/><image xlink:href="assets/a.png"/></svg>
</section>`;
      expect(inlineAssets(html, deckDir)).toBe(`<section class="slide">
  <img srcset="${x("image/png")} 1x, ${x("image/png")} 2x" src="${x("image/png")}" alt="">
  <video src="${x("video/mp4")}" poster="${x("image/png")}"><source src="${x("video/webm")}"><track src="${x("text/vtt")}"></video>
  <object data="${x("image/svg+xml")}"></object>
  <svg><image href="${x("image/png")}" /><image xlink:href="${x("image/png")}" /></svg>
</section>`);
    });
  });

  test("leaves every local resource lint would check already inlined", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/a.png", "assets/a.mp4"]);
      const html = `<section class="slide">
  <picture><source srcset="assets/a.png 480w,assets/a.png 800w" sizes="50vw"><img src="assets/a.png" alt=""></picture>
  <video src="assets/a.mp4" poster="assets/a.png"></video>
  <link rel="preload" as="image" imagesrcset="assets/a.png 1x">
  <table background="assets/a.png"></table>
</section>`;
      const left = scanSlideHtml(inlineAssets(html, deckDir)).refs.filter(
        (ref) =>
          ref.use === "resource" &&
          classifyAssetRef(ref.value, { deckDir, from: join(deckDir, "slides") }).kind !== "skip",
      );
      expect(left).toEqual([]);
    });
  });

  test("keeps srcset descriptors and the candidates it cannot inline", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/a.png"]);
      const html =
        '<img srcset="data:image/png;base64,AA 1x,  assets/a.png 2x, https://cdn.example.com/b.png 800w">';
      expect(inlineAssets(html, deckDir)).toBe(
        `<img srcset="data:image/png;base64,AA 1x,  ${x("image/png")} 2x, https://cdn.example.com/b.png 800w">`,
      );
    });
  });

  test("keeps a fragment, which names the part of the file to show", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/s.svg"]);
      expect(inlineAssets('<svg><use href="assets/s.svg#icon"/></svg>', deckDir)).toBe(
        `<svg><use href="${x("image/svg+xml")}#icon" /></svg>`,
      );
    });
  });

  test("leaves links alone, and text a pattern would mistake for an attribute", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/a.png"]);
      const html =
        '<a href="assets/a.png">a</a><p>src="assets/a.png"</p><script>img.src="assets/a.png"</script>';
      expect(inlineAssets(html, deckDir)).toBe(html);
    });
  });

  test.each([
    ["a.mp4", "video/mp4"],
    ["a.m4v", "video/mp4"],
    ["a.webm", "video/webm"],
    ["a.mov", "video/quicktime"],
    ["a.ogv", "video/ogg"],
    ["a.mp3", "audio/mpeg"],
    ["a.m4a", "audio/mp4"],
    ["a.wav", "audio/wav"],
    ["a.ogg", "audio/ogg"],
    ["a.opus", "audio/ogg"],
    ["a.flac", "audio/flac"],
    ["a.aac", "audio/aac"],
    ["a.avif", "image/avif"],
    ["a.ico", "image/x-icon"],
    ["a.bmp", "image/bmp"],
    ["a.apng", "image/apng"],
    ["a.JPG", "image/jpeg"],
    ["a.woff2", "font/woff2"],
    ["a.eot", "application/vnd.ms-fontobject"],
    ["a.vtt", "text/vtt"],
    ["a.bin", "application/octet-stream"],
  ])("types %s as %s", async (file, mime) => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, [`assets/${file}`]);
      expect(inlineAssets(`<audio src="assets/${file}"></audio>`, deckDir)).toBe(
        `<audio src="${x(mime)}"></audio>`,
      );
    });
  });
});

describe("inlineCssUrls", () => {
  test("inlines the url() tokens lint checks, and no url( written inside a string", async () => {
    await withTempDir(async (root) => {
      const deckDir = await deckWith(root, ["assets/a.png", "assets/f.woff2"]);
      const data = (mime: string) => `data:${mime};base64,${Buffer.from("x").toString("base64")}`;
      const css = `.slide::before { content: "url(assets/a.png)"; background: url( 'assets/a.png' ) no-repeat; }
@font-face { font-family: f; src: url(assets/f.woff2) format("woff2"); }`;
      expect(
        inlineCssUrls(css, deckDir),
      ).toBe(`.slide::before { content: "url(assets/a.png)"; background: url("${data("image/png")}") no-repeat; }
@font-face { font-family: f; src: url("${data("font/woff2")}") format("woff2"); }`);
    });
  });
});
