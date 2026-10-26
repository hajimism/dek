import { describe, expect, test } from "bun:test";
import { posix } from "node:path";
import { Window } from "happy-dom";
import {
  type PptxRun,
  type PptxShape,
  type PptxSlide,
  pptxPackage,
} from "../../src/core/pptx-package.ts";
import { readZip } from "../helpers/zip.ts";

// A PNG's first bytes are enough for a part; nothing here decodes it.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const slide = (overrides: Partial<PptxSlide> = {}): PptxSlide => ({
  picture: PNG,
  description: "A chart of the timeline",
  notes: "最初の段落です。\n\n次の段落です。",
  layers: [
    {
      kind: "text",
      x: 80,
      y: 100,
      width: 400,
      height: 48,
      lineHeight: 48,
      runs: [
        {
          text: "見出し & <タグ>",
          size: 40,
          bold: true,
          italic: false,
          underline: false,
          strike: false,
          color: [17, 34, 51],
          alpha: 1,
          letterSpacing: 0,
          font: "Hiragino Sans",
        },
        {
          text: " faded",
          size: 40,
          bold: false,
          italic: true,
          underline: true,
          strike: false,
          color: [255, 0, 0],
          alpha: 0.5,
          letterSpacing: 2,
        },
      ],
    },
  ],
  ...overrides,
});

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#1a7f37"/></svg>';

const run = (text: string, overrides: Partial<PptxRun> = {}): PptxRun => ({
  text,
  size: 24,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: [20, 20, 20],
  alpha: 1,
  letterSpacing: 0,
  ...overrides,
});

/** A card as a theme draws one: a pale rounded box with a border, an icon, a heading, and a list. */
const card = (overrides: Partial<PptxShape> = {}): PptxShape => ({
  kind: "shape",
  x: 100,
  y: 200,
  width: 400,
  height: 300,
  fill: { color: [240, 240, 240], alpha: 1 },
  outline: { width: 2, paint: { color: [200, 200, 200], alpha: 0.5 } },
  radius: 12,
  text: {
    inset: { left: 24, top: 80, right: 24, bottom: 24 },
    wrap: true,
    paragraphs: [
      {
        align: "left",
        lineHeight: 36,
        spaceBefore: 0,
        marginLeft: 0,
        marginRight: 0,
        indent: 0,
        runs: [run("見出し", { bold: true, size: 28 })],
      },
      {
        align: "center",
        lineHeight: 32,
        spaceBefore: 12,
        marginLeft: 24,
        marginRight: 8,
        indent: -20,
        bullet: { char: "•" },
        runs: [run("一行目\n二行目")],
      },
      {
        align: "right",
        lineHeight: 32,
        spaceBefore: 0,
        marginLeft: 24,
        marginRight: 0,
        indent: -20,
        bullet: { startAt: 3 },
        runs: [run("番号")],
      },
    ],
  },
  layers: [
    {
      kind: "picture",
      x: 124,
      y: 224,
      width: 40,
      height: 40,
      png: PNG,
      svg: SVG,
      description: "a check mark",
    },
    {
      kind: "rule",
      x1: 100,
      y1: 499,
      x2: 500,
      y2: 499,
      width: 2,
      paint: { color: [0, 0, 0], alpha: 1 },
    },
  ],
  ...overrides,
});

function open(slides: PptxSlide[]) {
  const files = readZip(
    pptxPackage({ title: "Plan & more", lang: "ja", size: { width: 1280, height: 720 }, slides }),
  );
  const decode = (name: string) => new TextDecoder().decode(files.get(name));
  const parser = new new Window().DOMParser();
  const xml = (name: string) => {
    const doc = parser.parseFromString(decode(name), "application/xml");
    const error = doc.querySelector("parsererror");
    if (error) {
      throw new Error(`${name}: ${error.textContent}`);
    }
    return doc;
  };
  return { files, decode, xml };
}

describe("pptxPackage", () => {
  test("names every part in its content types, and every part parses", () => {
    const { files, xml } = open([slide(), slide({ layers: [] })]);
    const types = xml("[Content_Types].xml");
    const overrides = [...types.getElementsByTagName("Override")].map((el) =>
      (el.getAttribute("PartName") ?? "").slice(1),
    );
    const defaults = [...types.getElementsByTagName("Default")].map((el) =>
      el.getAttribute("Extension"),
    );
    for (const name of files.keys()) {
      const extension = name.split(".").pop();
      expect({
        name,
        typed: overrides.includes(name) || defaults.includes(extension ?? ""),
      }).toEqual({
        name,
        typed: true,
      });
      if (name.endsWith(".xml") || name.endsWith(".rels")) {
        xml(name);
      }
    }
    for (const name of overrides) {
      expect(files.has(name)).toBe(true);
    }
    expect([...files.keys()]).toContain("ppt/slides/slide2.xml");
    expect([...files.keys()]).toContain("ppt/notesSlides/notesSlide2.xml");
    expect([...files.keys()]).toContain("ppt/media/image2.png");
  });

  test("resolves every relationship to a part in the package", () => {
    const { files, xml } = open([slide(), slide()]);
    for (const name of [...files.keys()].filter((entry) => entry.endsWith(".rels"))) {
      const from = posix.dirname(posix.dirname(name));
      for (const rel of xml(name).getElementsByTagName("Relationship")) {
        const target = posix.normalize(posix.join(from, rel.getAttribute("Target") ?? ""));
        expect({ name, target, there: files.has(target) }).toEqual({ name, target, there: true });
      }
    }
  });

  test("lists the slides in order at the slide's logical size", () => {
    const { xml } = open([slide(), slide()]);
    const presentation = xml("ppt/presentation.xml");
    expect(presentation.getElementsByTagName("p:sldId")).toHaveLength(2);
    const size = presentation.getElementsByTagName("p:sldSz")[0];
    expect([size?.getAttribute("cx"), size?.getAttribute("cy")]).toEqual(["12192000", "6858000"]);
  });

  test("lays the picture over the whole slide, described for a screen reader", () => {
    const { xml, decode } = open([slide()]);
    const pic = xml("ppt/slides/slide1.xml").getElementsByTagName("p:pic")[0];
    expect(pic?.getElementsByTagName("p:cNvPr")[0]?.getAttribute("descr")).toBe(
      "A chart of the timeline",
    );
    expect(pic?.getElementsByTagName("a:ext")[0]?.getAttribute("cx")).toBe("12192000");
    expect(decode("ppt/media/image1.png")).toBe(new TextDecoder().decode(PNG));
  });

  test("sets each line of text where the browser drew it, in its size, color, and font, unwrapped, with room to run on", () => {
    const { xml } = open([slide()]);
    const doc = xml("ppt/slides/slide1.xml");
    const [box] = [...doc.getElementsByTagName("p:sp")];
    expect(box?.getElementsByTagName("p:cNvSpPr")[0]?.getAttribute("txBox")).toBe("1");
    const off = box?.getElementsByTagName("a:off")[0];
    const ext = box?.getElementsByTagName("a:ext")[0];
    expect([off?.getAttribute("x"), off?.getAttribute("y")]).toEqual(["762000", "952500"]);
    // 400px of line and 100px of room past its end, a quarter of it; 48px high.
    expect([ext?.getAttribute("cx"), ext?.getAttribute("cy")]).toEqual(["4762500", "457200"]);
    const body = box?.getElementsByTagName("a:bodyPr")[0];
    expect(body?.getAttribute("wrap")).toBe("none");
    expect(["lIns", "tIns", "rIns", "bIns"].map((name) => body?.getAttribute(name))).toEqual([
      "0",
      "0",
      "0",
      "0",
    ]);
    const runs = [...(box?.getElementsByTagName("a:r") ?? [])];
    expect(runs.map((run) => run.getElementsByTagName("a:t")[0]?.textContent)).toEqual([
      "見出し & <タグ>",
      " faded",
    ]);
    const [first, second] = runs.map((run) => run.getElementsByTagName("a:rPr")[0]);
    expect(first?.getAttribute("sz")).toBe("3000");
    expect(first?.getAttribute("b")).toBe("1");
    expect(first?.getElementsByTagName("a:srgbClr")[0]?.getAttribute("val")).toBe("112233");
    expect(first?.getElementsByTagName("a:latin")[0]?.getAttribute("typeface")).toBe(
      "Hiragino Sans",
    );
    expect(first?.getElementsByTagName("a:ea")[0]?.getAttribute("typeface")).toBe("Hiragino Sans");
    expect(second?.getAttribute("i")).toBe("1");
    expect(second?.getAttribute("u")).toBe("sng");
    expect(second?.getAttribute("spc")).toBe("150");
    expect(second?.getElementsByTagName("a:alpha")[0]?.getAttribute("val")).toBe("50000");
    expect(second?.getElementsByTagName("a:latin")).toHaveLength(0);
  });

  test("leaves the text alone as ADR 8 has it when the slide has nothing else laid over it", () => {
    const { decode } = open([slide()]);
    const xml = decode("ppt/slides/slide1.xml");
    expect(xml).not.toContain("<p:grpSp>");
    expect(xml.match(/<p:pic>/g)).toHaveLength(1);
    expect(decode("ppt/slides/_rels/slide1.xml.rels").match(/<Relationship /g)).toHaveLength(3);
  });

  test("draws a box as a shape, its outline on the border's midline, its corners PowerPoint's", () => {
    const { xml } = open([slide({ layers: [card({ layers: [], text: undefined })] })]);
    const shape = xml("ppt/slides/slide1.xml").getElementsByTagName("p:sp")[0];
    // The path runs a border's half width inside the border box: 101,201 and 398 by 298.
    const off = shape?.getElementsByTagName("a:off")[0];
    const ext = shape?.getElementsByTagName("a:ext")[0];
    expect([off?.getAttribute("x"), off?.getAttribute("y")]).toEqual(["962025", "1914525"]);
    expect([ext?.getAttribute("cx"), ext?.getAttribute("cy")]).toEqual(["3790950", "2838450"]);
    const geometry = shape?.getElementsByTagName("a:prstGeom")[0];
    expect(geometry?.getAttribute("prst")).toBe("roundRect");
    // 11px of radius on the path over its 298px side.
    expect(geometry?.getElementsByTagName("a:gd")[0]?.getAttribute("fmla")).toBe("val 3691");
    const fill = shape?.getElementsByTagName("p:spPr")[0]?.getElementsByTagName("a:solidFill")[0];
    expect(fill?.getElementsByTagName("a:srgbClr")[0]?.getAttribute("val")).toBe("F0F0F0");
    const line = shape?.getElementsByTagName("a:ln")[0];
    expect(line?.getAttribute("w")).toBe("19050");
    expect(line?.getElementsByTagName("a:srgbClr")[0]?.getAttribute("val")).toBe("C8C8C8");
    expect(line?.getElementsByTagName("a:alpha")[0]?.getAttribute("val")).toBe("50000");
    expect(shape?.getElementsByTagName("p:txBody")).toHaveLength(0);
  });

  test("draws square corners as a rectangle, round ones a pill at most, and no outline as none", () => {
    const { xml } = open([
      slide({
        layers: [
          card({ layers: [], text: undefined, radius: 0, outline: undefined }),
          card({ layers: [], text: undefined, radius: 999, outline: undefined, fill: undefined }),
        ],
      }),
    ]);
    const [square, pill] = [...xml("ppt/slides/slide1.xml").getElementsByTagName("p:sp")];
    expect(square?.getElementsByTagName("a:prstGeom")[0]?.getAttribute("prst")).toBe("rect");
    expect(square?.getElementsByTagName("a:ln")[0]?.getElementsByTagName("a:noFill")).toHaveLength(
      1,
    );
    expect(pill?.getElementsByTagName("a:gd")[0]?.getAttribute("fmla")).toBe("val 50000");
    expect(
      [...(pill?.getElementsByTagName("p:spPr")[0]?.children ?? [])].map((el) => el.tagName),
    ).toEqual(["a:xfrm", "a:prstGeom", "a:noFill", "a:ln"]);
  });

  test("sets a shape's text in paragraphs, wrapped inside its insets, with bullets and breaks", () => {
    const { xml } = open([slide({ layers: [card({ layers: [] })] })]);
    const shape = xml("ppt/slides/slide1.xml").getElementsByTagName("p:sp")[0];
    const body = shape?.getElementsByTagName("a:bodyPr")[0];
    expect(body?.getAttribute("wrap")).toBe("square");
    expect(body?.getAttribute("anchor")).toBe("t");
    // The insets are the border box's, less the border's half the path already took.
    expect(["lIns", "tIns", "rIns", "bIns"].map((name) => body?.getAttribute(name))).toEqual([
      "219075",
      "752475",
      "219075",
      "219075",
    ]);
    const paragraphs = [...(shape?.getElementsByTagName("a:p") ?? [])];
    expect(paragraphs.map((p) => p.getElementsByTagName("a:pPr")[0]?.getAttribute("algn"))).toEqual(
      ["l", "ctr", "r"],
    );
    const [heading, bulleted, numbered] = paragraphs.map((p) => p.getElementsByTagName("a:pPr")[0]);
    expect(heading?.getElementsByTagName("a:buNone")).toHaveLength(1);
    expect(
      heading?.getElementsByTagName("a:lnSpc")[0]?.firstElementChild?.getAttribute("val"),
    ).toBe("2700");
    expect([
      bulleted?.getAttribute("marL"),
      bulleted?.getAttribute("marR"),
      bulleted?.getAttribute("indent"),
    ]).toEqual(["228600", "76200", "-190500"]);
    expect(
      bulleted?.getElementsByTagName("a:spcBef")[0]?.firstElementChild?.getAttribute("val"),
    ).toBe("900");
    expect(bulleted?.getElementsByTagName("a:buChar")[0]?.getAttribute("char")).toBe("•");
    const number = numbered?.getElementsByTagName("a:buAutoNum")[0];
    expect([number?.getAttribute("type"), number?.getAttribute("startAt")]).toEqual([
      "arabicPeriod",
      "3",
    ]);
    // A break inside a run splits it in two around PowerPoint's line break.
    const second = paragraphs[1];
    expect([...(second?.children ?? [])].map((el) => el.tagName)).toEqual([
      "a:pPr",
      "a:r",
      "a:br",
      "a:r",
    ]);
    expect(second?.textContent).toBe("一行目二行目");
  });

  test("writes no margin below zero, and keeps an alternative text's line breaks", () => {
    const text = card().text;
    const [first, ...rest] = text?.paragraphs ?? [];
    if (!text || !first) {
      throw new Error("no text");
    }
    const { xml, decode } = open([
      slide({
        layers: [
          card({
            layers: [
              {
                kind: "picture",
                x: 124,
                y: 224,
                width: 40,
                height: 40,
                png: PNG,
                description: "一行目\n二行目",
              },
            ],
            text: {
              ...text,
              paragraphs: [{ ...first, marginLeft: -0.4, marginRight: -0.9 }, ...rest],
            },
          }),
        ],
      }),
    ]);
    const doc = xml("ppt/slides/slide1.xml");
    const heading = doc.getElementsByTagName("a:pPr")[0];
    expect([heading?.getAttribute("marL"), heading?.getAttribute("marR")]).toEqual(["0", "0"]);
    // Written as a newline, XML would read the break back as a space.
    expect(decode("ppt/slides/slide1.xml")).toContain('descr="一行目&#10;二行目"');
  });

  test("keeps a shape's text on one line when the browser set it on one", () => {
    const text = card().text;
    if (!text) {
      throw new Error("no text");
    }
    const { xml } = open([
      slide({ layers: [card({ layers: [], text: { ...text, wrap: false } })] }),
    ]);
    const body = xml("ppt/slides/slide1.xml").getElementsByTagName("a:bodyPr")[0];
    expect(body?.getAttribute("wrap")).toBe("none");
  });

  test("groups a shape with what it holds, in order, the group as large as its parts' frames", () => {
    const { xml } = open([slide({ layers: [card()] })]);
    const doc = xml("ppt/slides/slide1.xml");
    const group = doc.getElementsByTagName("p:grpSp")[0];
    expect([...(group?.children ?? [])].map((el) => el.tagName)).toEqual([
      "p:nvGrpSpPr",
      "p:grpSpPr",
      "p:sp",
      "p:pic",
      "p:cxnSp",
    ]);
    const transform = group
      ?.getElementsByTagName("p:grpSpPr")[0]
      ?.getElementsByTagName("a:xfrm")[0];
    const read = (tag: string) => {
      const el = transform?.getElementsByTagName(tag)[0];
      return [
        el?.getAttribute("x") ?? el?.getAttribute("cx"),
        el?.getAttribute("y") ?? el?.getAttribute("cy"),
      ];
    };
    // The frames its parts are written with, put together: the card's path from 101,201 to
    // 499,499, the rule from 100 to 500; child space the same as the slide's.
    expect(read("a:off")).toEqual(["952500", "1914525"]);
    expect(read("a:ext")).toEqual(["3810000", "2838450"]);
    expect(read("a:chOff")).toEqual(read("a:off"));
    expect(read("a:chExt")).toEqual(read("a:ext"));
    const ids = [...doc.getElementsByTagName("p:cNvPr")].map((el) => el.getAttribute("id"));
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("draws a rule as a straight line on its midline, flat at the ends", () => {
    const { xml } = open([slide({ layers: [card()] })]);
    const rule = xml("ppt/slides/slide1.xml").getElementsByTagName("p:cxnSp")[0];
    expect(rule?.getElementsByTagName("a:prstGeom")[0]?.getAttribute("prst")).toBe("line");
    const off = rule?.getElementsByTagName("a:off")[0];
    const ext = rule?.getElementsByTagName("a:ext")[0];
    expect([
      off?.getAttribute("x"),
      off?.getAttribute("y"),
      ext?.getAttribute("cx"),
      ext?.getAttribute("cy"),
    ]).toEqual(["952500", "4752975", "3810000", "0"]);
    const line = rule?.getElementsByTagName("a:ln")[0];
    expect([line?.getAttribute("w"), line?.getAttribute("cap")]).toEqual(["19050", "flat"]);
  });

  test("embeds a picture as its PNG, and its SVG for a renderer that draws one", () => {
    const { xml, decode, files } = open([slide({ layers: [card()] })]);
    const pic = [...xml("ppt/slides/slide1.xml").getElementsByTagName("p:pic")][1];
    expect(pic?.getElementsByTagName("p:cNvPr")[0]?.getAttribute("descr")).toBe("a check mark");
    const blip = pic?.getElementsByTagName("a:blip")[0];
    const svgBlip = blip?.getElementsByTagName("asvg:svgBlip")[0];
    expect(blip?.getElementsByTagName("a:ext")[0]?.getAttribute("uri")).toBe(
      "{96DAC541-7B7A-43D3-8B79-37D633B846F1}",
    );
    const rels = xml("ppt/slides/_rels/slide1.xml.rels");
    const target = (id: string | null | undefined) =>
      [...rels.getElementsByTagName("Relationship")]
        .find((rel) => rel.getAttribute("Id") === id)
        ?.getAttribute("Target");
    const png = target(blip?.getAttribute("r:embed"));
    const svg = target(svgBlip?.getAttribute("r:embed"));
    expect(png).toMatch(/^\.\.\/media\/image\d+\.png$/);
    expect(svg).toMatch(/^\.\.\/media\/image\d+\.svg$/);
    expect(png).not.toBe("../media/image1.png");
    expect(decode(`ppt/media/${svg?.split("/").pop()}`)).toBe(SVG);
    expect(files.get(`ppt/media/${png?.split("/").pop()}`)).toEqual(PNG);
    const types = xml("[Content_Types].xml");
    expect(
      [...types.getElementsByTagName("Default")]
        .find((el) => el.getAttribute("Extension") === "svg")
        ?.getAttribute("ContentType"),
    ).toBe("image/svg+xml");
  });

  test("names every picture of every slide apart, and types and relates each", () => {
    const { files, xml } = open([slide({ layers: [card()] }), slide({ layers: [card(), card()] })]);
    const media = [...files.keys()].filter((name) => name.startsWith("ppt/media/"));
    // Two slide pictures, then three icons with an SVG each.
    expect(media).toHaveLength(2 + 3 * 2);
    for (const name of [...files.keys()].filter((entry) => entry.endsWith(".rels"))) {
      const from = posix.dirname(posix.dirname(name));
      for (const rel of xml(name).getElementsByTagName("Relationship")) {
        const target = posix.normalize(posix.join(from, rel.getAttribute("Target") ?? ""));
        expect({ name, target, there: files.has(target) }).toEqual({ name, target, there: true });
      }
    }
  });

  test("puts the script in the notes, a paragraph per line", () => {
    const { xml } = open([slide()]);
    const notes = xml("ppt/notesSlides/notesSlide1.xml");
    const paragraphs = [...notes.getElementsByTagName("a:p")].map((p) => p.textContent);
    expect(paragraphs).toEqual(["最初の段落です。", "", "次の段落です。"]);
  });

  test("leaves out characters XML cannot hold", () => {
    const { xml } = open([slide({ notes: "a\u0007b\u{1f600}" })]);
    expect(xml("ppt/notesSlides/notesSlide1.xml").getElementsByTagName("a:t")[0]?.textContent).toBe(
      "ab\u{1f600}",
    );
  });

  test("names the talk in its properties", () => {
    const { xml } = open([slide()]);
    expect(xml("docProps/core.xml").getElementsByTagName("dc:title")[0]?.textContent).toBe(
      "Plan & more",
    );
  });
});
