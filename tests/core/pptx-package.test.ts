import { describe, expect, test } from "bun:test";
import { posix } from "node:path";
import { Window } from "happy-dom";
import { type PptxSlide, pptxPackage } from "../../src/core/pptx-package.ts";
import { readZip } from "../helpers/zip.ts";

// A PNG's first bytes are enough for a part; nothing here decodes it.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const slide = (overrides: Partial<PptxSlide> = {}): PptxSlide => ({
  picture: PNG,
  description: "A chart of the timeline",
  notes: "最初の段落です。\n\n次の段落です。",
  texts: [
    {
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
    const { files, xml } = open([slide(), slide({ texts: [] })]);
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
