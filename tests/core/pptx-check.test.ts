import { describe, expect, test } from "bun:test";
import { checkPptxJson } from "../../src/core/pptx-check.ts";
import type { PptxJson, PptxJsonLayer } from "../../src/core/pptx-json.ts";
import type { PptxSpec, PptxSpecNode } from "../../src/core/pptx-spec.ts";

// What `dekc pptx --from` says of an edited PPTX against the deck's spec: each finding a
// diagnostic on its slide, with what to do next.

const run = (text: string) => ({ text, size: 20, color: "#000000" });

const prose = (
  text: string,
  extra: Partial<Extract<PptxJsonLayer, { kind: "prose" }>> = {},
): PptxJsonLayer => ({
  kind: "prose",
  x: 72,
  y: 72,
  width: 600,
  height: 60,
  text: { paragraphs: [{ runs: [run(text)] }] },
  ...extra,
});

const node = (content: string, extra: Partial<PptxSpecNode> = {}): PptxSpecNode => ({
  tag: "p",
  x: 72,
  y: 72,
  width: 600,
  height: 60,
  text: { align: "left", lines: 1, lineHeight: 24, content, runs: [] },
  ...extra,
});

function spec(slides: Array<{ slug: string; title: string; texts: PptxSpecNode[] }>): PptxSpec {
  return {
    source: "",
    deck: { title: "Deck", lang: "ja", size: { width: 1280, height: 720 } },
    tokens: { colors: {}, fonts: {} },
    slides: slides.map((slide, index) => ({
      index: index + 1,
      slug: slide.slug,
      title: slide.title,
      notes: "話すこと",
      shot: `.cache/pptx/shots/${index + 1}-${slide.slug}.png`,
      outline: {
        tag: "section",
        x: 0,
        y: 0,
        width: 1280,
        height: 720,
        children: slide.texts,
      },
    })),
  };
}

function file(slides: PptxJson["slides"]): PptxJson {
  return { title: "Deck", lang: "ja", size: { width: 1280, height: 720 }, slides };
}

const ids = (json: PptxJson, reference: PptxSpec) =>
  checkPptxJson(json, reference).map((each) => `${each.id} ${each.slug ?? ""}`.trim());

describe("checkPptxJson", () => {
  const reference = spec([
    {
      slug: "cover",
      title: "表紙",
      texts: [node("表紙", { tag: "h2", heading: 2 }), node("本文です")],
    },
  ]);

  test("a slide with its title, all its text, and its notes has nothing to say", () => {
    const json = file([
      {
        slug: "cover",
        notes: "話すこと",
        layers: [prose("表紙", { title: true }), prose("本文です", { y: 200 })],
      },
    ]);
    expect(checkPptxJson(json, reference)).toEqual([]);
  });

  test("text the slide shows that no layer holds is lost", () => {
    const json = file([{ slug: "cover", notes: "n", layers: [prose("表紙", { title: true })] }]);
    const [lost] = checkPptxJson(json, reference);
    expect(lost).toMatchObject({
      id: "pptx-text",
      severity: "error",
      slug: "cover",
      data: { missing: ["本文です"] },
    });
  });

  test("text split across boxes, or set in other runs, is still there", () => {
    const json = file([
      {
        slug: "cover",
        notes: "n",
        layers: [
          prose("表紙", { title: true }),
          { kind: "text", x: 72, y: 200, width: 100, height: 20, runs: [run("本文")] },
          { kind: "text", x: 72, y: 220, width: 100, height: 20, runs: [run("で"), run("す")] },
        ],
      },
    ]);
    expect(ids(json, reference)).toEqual(["pptx-lines cover"]);
  });

  test("decoration is not text the file must hold", () => {
    const decorated = spec([
      {
        slug: "cover",
        title: "表紙",
        texts: [node("表紙", { heading: 2 }), node("→", { decoration: true })],
      },
    ]);
    const json = file([{ slug: "cover", notes: "n", layers: [prose("表紙", { title: true })] }]);
    expect(ids(json, decorated)).toEqual([]);
  });

  test("a slide without its title placeholder is listed by nothing in PowerPoint", () => {
    const json = file([
      { slug: "cover", notes: "n", layers: [prose("表紙"), prose("本文です", { y: 200 })] },
    ]);
    expect(ids(json, reference)).toEqual(["pptx-title cover"]);
  });

  test("a picture of the rest of the slide is what the rebuild is for", () => {
    const json = file([
      {
        slug: "cover",
        notes: "n",
        picture: ".cache/pptx/pictures/1.png",
        layers: [prose("表紙", { title: true }), prose("本文です", { y: 200 })],
      },
    ]);
    const [picture] = checkPptxJson(json, reference);
    expect(picture).toMatchObject({ id: "pptx-picture", severity: "warning", slug: "cover" });
  });

  test("slides missing, added, or out of order are the deck's no longer", () => {
    const two = spec([
      { slug: "a", title: "A", texts: [node("A", { heading: 2 })] },
      { slug: "b", title: "B", texts: [node("B", { heading: 2 })] },
    ]);
    const slide = (slug: string) => ({
      slug,
      notes: "n",
      layers: [prose(slug.toUpperCase(), { title: true })],
    });
    expect(ids(file([slide("b"), slide("a")]), two)).toEqual(["pptx-slides"]);
    expect(ids(file([slide("a")]), two)).toEqual(["pptx-slides"]);
    expect(ids(file([slide("a"), slide("b"), slide("c")]), two)).toEqual(["pptx-slides"]);
  });

  test("a layer off the slide is out of every view", () => {
    const json = file([
      {
        slug: "cover",
        notes: "n",
        layers: [prose("表紙", { title: true }), prose("本文です", { x: 1200, width: 200 })],
      },
    ]);
    const [off] = checkPptxJson(json, reference);
    expect(off).toMatchObject({ id: "pptx-bounds", severity: "error", slug: "cover" });
  });

  test("empty notes on a slide the script speaks to are a warning", () => {
    const json = file([
      { slug: "cover", layers: [prose("表紙", { title: true }), prose("本文です", { y: 200 })] },
    ]);
    expect(ids(json, reference)).toEqual(["pptx-notes cover"]);
  });
});
