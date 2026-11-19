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

  test("a table's texts are found in its cells, and a cell narrower than its line wraps it", () => {
    // Three cells in a row, each the browser set on one line, 180 px set 10% wider in each.
    const cell = (content: string, x: number) =>
      node(content, {
        tag: "td",
        x,
        y: 300,
        width: 200,
        height: 30,
        text: {
          align: "left",
          lines: 1,
          lineHeight: 24,
          content,
          widen: 1.1,
          runs: [],
          pieces: [{ text: content, x, y: 303, width: 180, height: 24 }],
        },
      });
    const reference = spec([
      {
        slug: "files",
        title: "表紙",
        texts: [
          node("表紙", { tag: "h2", heading: 2 }),
          node("script台本のその節8 行", {
            tag: "table",
            x: 100,
            y: 300,
            width: 600,
            height: 30,
            text: undefined,
            children: [cell("script", 100), cell("台本のその節", 300), cell("8 行", 500)],
          }),
        ],
      },
    ]);
    const table = (texts: string[], columns = [200, 200, 200]): PptxJsonLayer => ({
      kind: "table",
      x: 100,
      y: 300,
      columns,
      rows: [
        {
          height: 30,
          cells: texts.map((text) => ({ paragraphs: [{ runs: [run(text)] }] })),
        },
      ],
    });
    const at = (layer: PptxJsonLayer) =>
      file([{ slug: "files", notes: "n", layers: [prose("表紙", { title: true }), layer] }]);
    const texts = ["script", "台本のその節", "8 行"];
    expect(ids(at(table(texts)), reference)).toEqual([]);
    // A text in another cell of the table is away from where the slide shows it.
    expect(ids(at(table(["8 行", "台本のその節", "script"])), reference)).toEqual([
      "pptx-place files",
    ]);
    expect(ids(at(table(["script", "台本のその節", ""])), reference)).toEqual(["pptx-text files"]);
    // A cell's text is looked for in the cell it lies in, not in the one beside it.
    expect(ids(at(table(["台本のその節", "script", "8 行"])), reference)).toEqual([
      "pptx-place files",
    ]);
    // A cell's text always wraps, inside its column less its insets: 198 px in 184 wraps.
    const inset = at(table(texts));
    const row = inset.slides[0]?.layers[1];
    if (row?.kind === "table") {
      for (const each of row.rows[0]?.cells ?? []) {
        each.inset = { left: 8, top: 0, right: 8, bottom: 0 };
      }
    }
    const [fit, ...rest] = checkPptxJson(inset, reference);
    expect(rest).toEqual([]);
    expect(fit).toMatchObject({
      id: "pptx-fit",
      data: { texts: [{ text: "script", width: 184, needs: 198 }, {}, {}] },
    });
    expect(ids(at(table(texts, [200, 200, 900])), reference)).toEqual(["pptx-bounds files"]);
  });

  test("a cell's text is measured against its own cell, not a narrower one beside it", () => {
    // "台本" needs 150 px in a cell 300 wide; the cell beside it, 100 wide, says more.
    const reference = spec([
      {
        slug: "files",
        title: "表紙",
        texts: [
          node("表紙", { tag: "h2", heading: 2 }),
          node("台本", {
            tag: "td",
            x: 100,
            y: 300,
            width: 300,
            height: 30,
            text: {
              align: "left",
              lines: 1,
              lineHeight: 24,
              content: "台本",
              runs: [],
              pieces: [{ text: "台本", x: 100, y: 303, width: 150, height: 24 }],
            },
          }),
          node("台本のその節", { tag: "td", x: 400, y: 300, width: 100, height: 30 }),
        ],
      },
    ]);
    const json = file([
      {
        slug: "files",
        notes: "n",
        layers: [
          prose("表紙", { title: true }),
          {
            kind: "table",
            x: 100,
            y: 300,
            columns: [300, 100],
            rows: [
              {
                height: 30,
                cells: [
                  { paragraphs: [{ runs: [run("台本")] }] },
                  { paragraphs: [{ runs: [run("台本のその節")] }] },
                ],
              },
            ],
          },
        ],
      },
    ]);
    expect(ids(json, reference)).toEqual([]);
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
