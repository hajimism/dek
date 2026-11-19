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
      texts: [node("表紙", { tag: "h2", heading: 2 }), node("本文です", { y: 200 })],
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

  test("text set away from where the slide shows it is in the wrong place", () => {
    const json = file([
      {
        slug: "cover",
        notes: "n",
        layers: [prose("表紙", { title: true }), prose("本文です", { y: 500 })],
      },
    ]);
    const [moved] = checkPptxJson(json, reference);
    expect(moved).toMatchObject({
      id: "pptx-place",
      severity: "warning",
      slug: "cover",
      data: { texts: ["本文です"] },
    });
  });

  test("a text lost is named alone, though another text holds its characters", () => {
    const json = file([
      {
        slug: "cover",
        notes: "n",
        layers: [prose("表紙", { title: true }), prose("本文", { y: 200 })],
      },
    ]);
    expect(checkPptxJson(json, reference)[0]).toMatchObject({
      id: "pptx-text",
      data: { missing: ["本文です"] },
    });
  });

  test("a picture the size of the slide is a picture of the slide, unless the slide shows one", () => {
    const backdrop: PptxJsonLayer = {
      kind: "picture",
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
      file: ".cache/pptx/parts/1-0.png",
    };
    const json = file([
      {
        slug: "cover",
        notes: "n",
        layers: [backdrop, prose("表紙", { title: true }), prose("本文です", { y: 200 })],
      },
    ]);
    expect(ids(json, reference)).toEqual(["pptx-picture cover"]);
    const photo = spec([
      {
        slug: "cover",
        title: "表紙",
        texts: [
          node("", {
            tag: "img",
            picture: "image",
            x: 0,
            y: 0,
            width: 1280,
            height: 720,
            text: undefined,
          }),
          node("表紙", { tag: "h2", heading: 2 }),
          node("本文です", { y: 200 }),
        ],
      },
    ]);
    expect(ids(json, photo)).toEqual([]);
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

  test("a second title, or one with nothing in it, is a title PowerPoint shows as a prompt", () => {
    const twice = file([
      {
        slug: "cover",
        notes: "n",
        layers: [prose("表紙", { title: true }), prose("本文です", { y: 200, title: true })],
      },
    ]);
    expect(ids(twice, reference)).toEqual(["pptx-title cover"]);
    const empty = file([
      {
        slug: "cover",
        notes: "n",
        layers: [prose("表紙"), prose("", { title: true, y: 300 }), prose("本文です", { y: 200 })],
      },
    ]);
    expect(checkPptxJson(empty, reference)[0]?.message).toContain("holds no text");
  });

  test("a line the browser set on one line that PowerPoint, setting it wider, wraps", () => {
    // 300 px of text set 10% wider needs 330 px; a box of 320 px wraps it.
    const line = node("一行の見出し", {
      tag: "h2",
      heading: 2,
      width: 320,
      text: {
        align: "left",
        lines: 1,
        lineHeight: 48,
        content: "一行の見出し",
        widen: 1.1,
        runs: [],
        pieces: [{ text: "一行の見出し", x: 72, y: 80, width: 300, height: 40 }],
      },
    });
    const wide = spec([{ slug: "cover", title: "一行の見出し", texts: [line] }]);
    const at = (width: number) =>
      file([
        {
          slug: "cover",
          notes: "n",
          layers: [prose("一行の見出し", { title: true, width })],
        },
      ]);
    const [fit] = checkPptxJson(at(320), wide);
    expect(fit).toMatchObject({
      id: "pptx-fit",
      severity: "warning",
      slug: "cover",
      data: { texts: [{ text: "一行の見出し", width: 320, needs: 330 }] },
    });
    expect(ids(at(332), wide)).toEqual([]);
    // A box that does not wrap is not wrapped, whatever its width.
    const unwrapped = at(320);
    const title = unwrapped.slides[0]?.layers[0];
    if (title?.kind === "prose") {
      title.text.wrap = false;
    }
    expect(ids(unwrapped, wide)).toEqual([]);
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
        layers: [
          prose("表紙", { title: true }),
          prose("本文です", { y: 200, x: 1200, width: 200 }),
        ],
      },
    ]);
    const off = checkPptxJson(json, reference).find((each) => each.id === "pptx-bounds");
    expect(off).toMatchObject({ id: "pptx-bounds", severity: "error", slug: "cover" });
  });

  test("empty notes on a slide the script speaks to are a warning", () => {
    const json = file([
      { slug: "cover", layers: [prose("表紙", { title: true }), prose("本文です", { y: 200 })] },
    ]);
    expect(ids(json, reference)).toEqual(["pptx-notes cover"]);
  });
});
