import { describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pptxCommand } from "../../src/cli/pptx.ts";
import { resolveDecks } from "../../src/cli/scope.ts";
import { DekError } from "../../src/core/error.ts";
import { pptxFromFile } from "../../src/core/pptx-from.ts";
import type { PptxJson } from "../../src/core/pptx-json.ts";
import { type PptxDeck, pptxParts } from "../../src/core/pptx-package.ts";
import { deckSourceHash } from "../../src/core/pptx-spec.ts";
import { withTempProject } from "../helpers/project.ts";
import { readZip } from "../helpers/zip.ts";

// `dekc pptx --from`: the JSON an agent wrote, refused when it is not what deck.pptx.json is,
// written with dek's own writer, and checked against spec.json only while spec.json is the deck's.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const json = (slides: PptxJson["slides"]): PptxJson => ({
  title: "Demo",
  lang: "ja",
  size: { width: 1280, height: 720 },
  slides,
});

const titled: PptxJson["slides"][number] = {
  slug: "intro",
  notes: "hello",
  layers: [
    {
      kind: "prose",
      x: 72,
      y: 72,
      width: 600,
      height: 60,
      title: true,
      text: { paragraphs: [{ runs: [{ text: "intro", size: 40, color: "#0f172a" }] }] },
    },
  ],
};

/** A project with one deck, `demo`, and the file at `name` in its folder holding `body`. */
async function withDeck<T>(
  body: unknown,
  fn: (deck: string, file: string) => Promise<T>,
  name = "pptx.json",
): Promise<T> {
  return withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
    const deck = join(root, "decks", "demo");
    const file = join(deck, name);
    await writeFile(file, typeof body === "string" ? body : JSON.stringify(body));
    return fn(deck, file);
  });
}

async function writeSpec(deck: string, source: string): Promise<void> {
  await mkdir(join(deck, ".cache", "pptx"), { recursive: true });
  await writeFile(
    join(deck, ".cache", "pptx", "spec.json"),
    JSON.stringify({
      source,
      deck: { title: "Demo", lang: "ja", size: { width: 1280, height: 720 } },
      tokens: { colors: {}, fonts: {} },
      slides: [
        {
          index: 1,
          slug: "intro",
          title: "intro",
          notes: "hello",
          shot: ".cache/pptx/shots/1-intro.png",
          outline: {
            tag: "section",
            x: 0,
            y: 0,
            width: 1280,
            height: 720,
            children: [
              {
                tag: "h2",
                x: 72,
                y: 72,
                width: 600,
                height: 60,
                heading: 2,
                text: { align: "left", lines: 1, lineHeight: 48, content: "intro", runs: [] },
              },
            ],
          },
        },
      ],
    }),
  );
}

describe("pptxFromFile", () => {
  test("writes the deck's PPTX and says the check did not run without a spec.json", async () => {
    await withDeck(json([titled]), async (deck, file) => {
      const done = await pptxFromFile(deck, file);
      expect(done.outPath).toBe(join(deck, "dist", "demo.pptx"));
      const files = readZip(new Uint8Array(await readFile(done.outPath)));
      expect(new TextDecoder().decode(files.get("ppt/slides/slide1.xml"))).toContain(
        '<p:ph type="title"/>',
      );
      expect(done.diagnostics).toEqual([]);
      expect(done.skipped).toEqual([
        {
          check: "pptx",
          reason: "there is no spec.json to check it against",
          hint: "run `dekc pptx demo spec`, then this again",
        },
      ]);
    });
  });

  test("checks against a spec.json as new as the deck, and not against an older one", async () => {
    const untitled = { ...titled, layers: [] };
    await withDeck(json([untitled]), async (deck, file) => {
      await writeSpec(deck, "an older deck");
      const stale = await pptxFromFile(deck, file);
      expect(stale.diagnostics).toEqual([]);
      expect(stale.skipped?.[0]?.reason).toContain("older than the deck");
      await writeSpec(deck, deckSourceHash(deck));
      const current = await pptxFromFile(deck, file);
      expect(current.skipped).toBeUndefined();
      expect(current.diagnostics.map((each) => each.id)).toEqual(["pptx-title", "pptx-text"]);
    });
  });

  test("refuses a field deck.pptx.json does not have, naming where it is", async () => {
    // A field the schema lacks, as a misspelled one would be.
    const extra = {
      ...json([titled]),
      slides: [{ ...titled, layers: [{ ...titled.layers[0], dashed: true }] }],
    };
    await withDeck(extra, async (deck, file) => {
      const refused = await pptxFromFile(deck, file).catch((error: unknown) => error);
      expect(refused).toBeInstanceOf(DekError);
      expect((refused as DekError).message).toContain("slides[0].layers[0]");
    });
  });

  test("refuses a picture outside the deck's folder, and one that is not there", async () => {
    const picture = (file: string) =>
      json([
        {
          ...titled,
          layers: [
            ...titled.layers,
            { kind: "picture" as const, x: 0, y: 0, width: 10, height: 10, file },
          ],
        },
      ]);
    await withTempProject({ decks: [{ name: "demo" }] }, async (root) => {
      const deck = join(root, "decks", "demo");
      await writeFile(join(root, "assets", "logo.png"), PNG);
      for (const name of ["../../assets/logo.png", "missing.png"]) {
        const file = join(deck, "pptx.json");
        await writeFile(file, JSON.stringify(picture(name)));
        const refused = await pptxFromFile(deck, file).catch((error: unknown) => error);
        expect((refused as DekError).message).toContain(`slides[0].layers[1].file ${name}`);
      }
      await writeFile(join(deck, "logo.png"), PNG);
      await writeFile(join(deck, "pptx.json"), JSON.stringify(picture("logo.png")));
      expect((await pptxFromFile(deck, join(deck, "pptx.json"))).outPath).toBeTruthy();
    });
  });

  test("refuses what is not JSON", async () => {
    await withDeck("{ not json", async (deck, file) => {
      const refused = await pptxFromFile(deck, file).catch((error: unknown) => error);
      expect((refused as DekError).message).toContain("is not JSON");
    });
  });
});

describe("dekc pptx --from's flags", () => {
  test("--shot draws what --from writes, and --public has no say in it", async () => {
    await withDeck(json([titled]), async (deck, file) => {
      const target = resolveDecks(deck);
      await expect(pptxCommand(target, { shot: true })).rejects.toThrow("--shot draws");
      await expect(pptxCommand(target, { from: file, public: true })).rejects.toThrow(
        "--public has no say",
      );
    });
  });
});

describe("what the writer says for a rebuilt deck", () => {
  const deck: PptxDeck = {
    title: "Demo",
    lang: "ja",
    size: { width: 1280, height: 720 },
    slides: [
      {
        backdrop: PNG,
        description: "",
        notes: "",
        layers: [
          {
            kind: "shape",
            x: 100,
            y: 100,
            width: 200,
            height: 200,
            radius: 0,
            geometry: "ellipse",
            outline: { width: 2, paint: { color: [0, 0, 0], alpha: 1 }, dash: "dash" },
            shadow: { x: 0, y: 4, blur: 8, paint: { color: [0, 0, 0], alpha: 0.2 } },
            rotate: -0.8,
            text: {
              inset: { left: 0, top: 0, right: 0, bottom: 0 },
              wrap: true,
              paragraphs: [
                {
                  align: "center",
                  lineHeight: 24,
                  spaceBefore: 0,
                  marginLeft: 0,
                  marginRight: 0,
                  indent: 0,
                  runs: [
                    {
                      text: "ok",
                      size: 20,
                      bold: false,
                      italic: false,
                      underline: false,
                      strike: false,
                      color: [0, 0, 0],
                      alpha: 1,
                      letterSpacing: 0,
                      highlight: [254, 243, 199],
                    },
                  ],
                },
              ],
            },
            layers: [],
          },
          {
            kind: "picture",
            x: 400,
            y: 100,
            width: 100,
            height: 100,
            rotate: 90,
            description: "icon",
            png: PNG,
          },
        ],
      },
    ],
  };
  const parts = new Map(pptxParts(deck).map((part) => [part.path, part.data]));
  const xml = new TextDecoder().decode(parts.get("ppt/slides/slide1.xml"));

  test("a preset shape, a dashed outline, a shadow, and a turn", () => {
    expect(xml).toContain('<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>');
    expect(xml).toContain('<a:prstDash val="dash"/>');
    expect(xml).toMatch(/<a:effectLst><a:outerShdw blurRad="76200" dist="38100" dir="5400000"/);
    expect(xml).toContain('<a:xfrm rot="21552000">');
    expect(xml).toContain('<a:xfrm rot="5400000">');
  });

  test("a backdrop every slide shares is the master's, and no slide's own", () => {
    const slide = deck.slides[0];
    if (!slide) {
      throw new Error("no slide");
    }
    const two = new Map(
      pptxParts({ ...deck, slides: [slide, { ...slide, layers: [] }] }).map((part) => [
        part.path,
        part.data,
      ]),
    );
    const text = (path: string) => new TextDecoder().decode(two.get(path));
    expect(text("ppt/slideMasters/slideMaster1.xml")).toContain('<a:blip r:embed="rId4"/>');
    expect(text("ppt/slideMasters/_rels/slideMaster1.xml.rels")).toMatch(
      /Id="rId4"[^>]*Target="..\/media\/image\d+.png"/,
    );
    expect(text("ppt/slides/slide1.xml")).not.toContain("<p:bg>");
    expect(text("ppt/slides/slide2.xml")).not.toContain("<p:bg>");
    // A picture each slide shows apart is each slide's.
    const apart = new Map(
      pptxParts({
        ...deck,
        slides: [slide, { ...slide, backdrop: new Uint8Array([...PNG, 1]) }],
      }).map((part) => [part.path, part.data]),
    );
    expect(new TextDecoder().decode(apart.get("ppt/slides/slide2.xml"))).toContain("<p:bg>");
  });

  test("a box rounded on its top side by its radius, its text where the browser set it", () => {
    const bar: PptxDeck = {
      ...deck,
      slides: [
        {
          description: "",
          notes: "",
          layers: [
            {
              kind: "shape",
              x: 0,
              y: 0,
              width: 400,
              height: 40,
              radius: 12,
              geometry: "round2SameRect",
              text: {
                inset: { left: 16, top: 10, right: 16, bottom: 10 },
                wrap: true,
                paragraphs: [],
              },
              layers: [],
            },
          ],
        },
      ],
    };
    const slide = new TextDecoder().decode(
      new Map(pptxParts(bar).map((part) => [part.path, part.data])).get("ppt/slides/slide1.xml"),
    );
    expect(slide).toContain('<a:gd name="adj1" fmla="val 30000"/><a:gd name="adj2" fmla="val 0"/>');
    // PowerPoint sets its text 12 × (1 − √½) inside its top, left, and right, and the insets give
    // that back: 10 − 3.51 px at the top, the whole 10 px at the bottom.
    expect(slide).toMatch(/lIns="(\d+)" tIns="(\d+)" rIns="\1" bIns="95250"/);
    expect(/tIns="(\d+)"/.exec(slide)?.[1]).toBe(
      String(Math.round((10 - 12 * (1 - Math.SQRT1_2)) * 9525)),
    );
  });

  test("a highlighted run, and a picture as the slide's background", () => {
    expect(xml).toContain('<a:highlight><a:srgbClr val="FEF3C7"></a:srgbClr></a:highlight>');
    const embed = /<p:bg><p:bgPr><a:blipFill[^>]*><a:blip r:embed="(rId\d+)"/.exec(xml)?.[1];
    const rels = new TextDecoder().decode(parts.get("ppt/slides/_rels/slide1.xml.rels"));
    expect(rels).toMatch(new RegExp(`Id="${embed}"[^>]*Target="../media/image\\d+.png"`));
  });
});
