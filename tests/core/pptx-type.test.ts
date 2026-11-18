import { describe, expect, test } from "bun:test";
import type { PptxBlockText, PptxMeasuredBox, PptxMeasuredRun } from "../../src/core/pptx-plan.ts";
import type { PptxFaceProbe, PptxPageTexts } from "../../src/core/pptx-text.ts";
import {
  type PptxFace,
  pptxFaceNames,
  pptxNameProbes,
  pptxSideProbes,
  pptxTypeRequests,
  scriptOf,
  setPptxTexts,
} from "../../src/core/pptx-type.ts";

// How measured text is set again, decided from measurements alone: no browser here, only the
// places and widths a page would give.

const use = (): PptxPageTexts["uses"][number] => ({
  family: "Sans",
  weight: "400",
  style: "normal",
  stretch: "100%",
  lang: "ja",
  features: 'font-feature-settings: "palt";',
  axes: "",
});

const run = (text: string, more: Partial<PptxMeasuredRun> = {}): PptxMeasuredRun => ({
  text,
  size: 20,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  color: [0, 0, 0],
  alpha: 1,
  letterSpacing: 0,
  owner: 0,
  use: 0,
  family: "Sans",
  ...more,
});

/** A line of one run, each character starting at its stop, the last ending at the last stop. */
const box = (text: string, stops: number[] | undefined, block = 0): PptxMeasuredBox => ({
  block,
  x: stops?.[0] ?? 0,
  y: 0,
  width: (stops?.at(-1) ?? 0) - (stops?.[0] ?? 0),
  height: 26,
  lineHeight: 26,
  runs: [run(text)],
  ...(stops ? { stops } : {}),
});

const texts = (boxes: PptxMeasuredBox[], blocks: PptxBlockText[] = []): PptxPageTexts => ({
  boxes,
  blocks,
  drawn: [],
  uses: [use()],
  pseudos: [],
});

/**
 * What a page would answer: each character 20 wide alone unless `widths` says otherwise, as
 * `[natural, featured]`; no plain line unless `lines` gives each box's.
 */
const answers = (
  page: PptxPageTexts,
  widths: Record<string, [number, number]> = {},
  more: { faces?: Record<string, string>; lines?: number[][] } = {},
) => {
  const requests = pptxTypeRequests(page);
  return {
    faces: new Map(Object.entries(more.faces ?? {})),
    glyphs: requests.glyphs.map(({ graphemes }) => ({
      natural: graphemes.map((each) => widths[each]?.[0] ?? 20),
      featured: graphemes.map((each) => widths[each]?.[1] ?? widths[each]?.[0] ?? 20),
    })),
    lines: more.lines ?? requests.lines.map(() => []),
  };
};

const spaced = (runs: PptxMeasuredRun[] | undefined) =>
  (runs ?? []).map((each) => [each.text, Math.round(each.letterSpacing * 100) / 100]);

describe("scriptOf", () => {
  test("tells Latin from East Asian text, and leaves what could be either to be named alone", () => {
    for (const latin of ["A", "z", "7", " ", ".", "é"]) {
      expect(scriptOf(latin)).toBe("latin");
    }
    for (const eastAsian of ["あ", "ア", "漢", "、", "「", "Ａ", "ｱ", "한", "　"]) {
      expect(scriptOf(eastAsian)).toBe("eastAsian");
    }
    for (const other of ["—", "→", "×", "·", "…", "“", "Ω", "★"]) {
      expect(scriptOf(other)).toBe("other");
    }
  });
});

describe("pptxTypeRequests", () => {
  test("asks for a face a script and a character of another kind, and for each line plainly", () => {
    const page = texts([box("Aあ—", [0, 20, 40, 60]), box("あ", undefined)]);
    const requests = pptxTypeRequests(page);
    expect(requests.faces.map((probe) => [probe.id, probe.text])).toEqual([
      ["0:latin", "A"],
      ["0:eastAsian", "あ"],
      ["0:c:—", "—"],
    ]);
    expect(requests.glyphs).toEqual([{ use: use(), size: 20, graphemes: ["A", "あ", "—"] }]);
    // A box whose characters the page did not place has no line to set again.
    expect(requests.lines).toEqual([[{ use: use(), size: 20, text: "Aあ—" }], []]);
  });
});

describe("setPptxTexts", () => {
  test("spaces a character a feature narrowed so the next starts where the browser put it", () => {
    // `palt` sets the comma at half its width: its ink is on its left, so nothing moves but
    // what follows it.
    const page = texts([box("かな、字", [0, 20, 40, 50, 70])]);
    const set = setPptxTexts(page, answers(page, { "、": [20, 10] }));
    expect(spaced(set.boxes[0]?.runs)).toEqual([
      ["かな", 0],
      ["、", -10],
      ["字", 0],
    ]);
    expect(set.boxes[0]?.shift).toBeUndefined();
    expect(set.boxes[0]?.stops).toBeUndefined();
  });

  test("writes the gap between two elements set side by side as the first one's last spacing", () => {
    // A chip's margin, or a flex gap: 10 pixels the browser left between two runs.
    const gapped: PptxMeasuredBox = {
      ...box("", [0, 30, 50, 70]),
      runs: [run("あ", { owner: 1 }), run("い字", { owner: 2 })],
    };
    const page = texts([gapped]);
    expect(spaced(setPptxTexts(page, answers(page)).boxes[0]?.runs)).toEqual([
      ["あ", 10],
      ["い字", 0],
    ]);
  });

  test("moves an opening bracket's ink, not only its width: the character before it is spaced", () => {
    const page = texts([box("字「字", [0, 20, 30, 50])]);
    const set = setPptxTexts(page, answers(page, { "「": [20, 10] }));
    // PowerPoint's bracket keeps the blank half on its left, so it starts half an em earlier.
    expect(spaced(set.boxes[0]?.runs)).toEqual([
      ["字", -10],
      ["「字", 0],
    ]);

    // One that starts the line starts the box that much earlier.
    const first = texts([box("「字", [0, 10, 30])]);
    const led = setPptxTexts(first, answers(first, { "「": [20, 10] }));
    expect(spaced(led.boxes[0]?.runs)).toEqual([["「字", 0]]);
    expect(led.boxes[0]?.shift).toBe(-10);

    // One the browser trimmed where it met a comma, with no feature of the text's own.
    const met = texts([box("、「字", [0, 20, 30, 50])]);
    expect(spaced(setPptxTexts(met, answers(met)).boxes[0]?.runs)).toEqual([
      ["、", -10],
      ["「字", 0],
    ]);
  });

  test("takes what a feature took from a kana from both its sides", () => {
    const page = texts([box("あい", [0, 16, 32])]);
    const set = setPptxTexts(page, answers(page, { あ: [20, 16], い: [20, 16] }));
    expect(spaced(set.boxes[0]?.runs)).toEqual([
      ["あ", -4],
      ["い", -2],
    ]);
    expect(set.boxes[0]?.shift).toBe(-2);
  });

  test("keeps a run whole within the tolerance, and lets nothing add up along the line", () => {
    const text = "abcdefghijklmnopqrst";
    // Each character a tenth of a pixel wider than it is alone: not every one is worth a run,
    // and a character is moved before what was let go reaches the tolerance.
    const stops = Array.from({ length: text.length + 1 }, (_, at) => at * 10.1);
    const page = texts([box(text, stops)]);
    const set = setPptxTexts(
      page,
      answers(page, Object.fromEntries([...text].map((each) => [each, [10, 10]]))),
    );
    const runs = set.boxes[0]?.runs ?? [];
    expect(runs.length).toBeLessThan(text.length);
    let pen = 0;
    let at = 0;
    for (const each of runs) {
      for (const _ of each.text) {
        expect(Math.abs(pen - (stops[at] ?? 0))).toBeLessThanOrEqual(0.26);
        pen += 10 + each.letterSpacing;
        at++;
      }
    }
    expect(Math.abs(pen - (stops.at(-1) ?? 0))).toBeLessThanOrEqual(0.26);
  });

  test("leaves kerning between Latin letters to the renderer, and writes it beside East Asian", () => {
    // "AV" kerned by 2 in the browser and in the plain line alike: nothing to write.
    const latin = texts([box("AV", [0, 12, 26])]);
    const kerned = setPptxTexts(
      latin,
      answers(latin, { A: [14, 14], V: [14, 14] }, { lines: [[0, 12, 26]] }),
    );
    expect(spaced(kerned.boxes[0]?.runs)).toEqual([["AV", 0]]);

    // The browser kerns kana and a renderer does not: the pair's kerning is in the spacing.
    const kana = texts([box("で。字", [0, 19, 39, 59])]);
    const written = setPptxTexts(kana, answers(kana, {}, { lines: [[0, 19, 39, 59]] }));
    expect(spaced(written.boxes[0]?.runs)).toEqual([
      ["で", -1],
      ["。字", 0],
    ]);
  });

  test("names the face that drew a run's Latin and the one that drew its East Asian text", () => {
    const page = texts([box("code 台本 — x", undefined)]);
    const faces = { "0:latin": "Menlo", "0:eastAsian": "Hiragino Sans", "0:c:—": "Menlo" };
    const runs = setPptxTexts(page, answers(page, {}, { faces })).boxes[0]?.runs ?? [];
    // A dash, and a space that does not follow Latin, could be given to either face: each is
    // named alone, in the face that drew it, whatever the theme's fonts become.
    expect(runs.map((each) => [each.text, each.font, each.ea, each.family])).toEqual([
      ["code 台本", "Menlo", "Hiragino Sans", "Sans"],
      [" — ", "Menlo", undefined, undefined],
      ["x", "Menlo", "Hiragino Sans", "Sans"],
    ]);

    // Where one face drew everything there is nothing to tell apart; a third face is named.
    const one = { "0:latin": "Hiragino Sans", "0:eastAsian": "Hiragino Sans" };
    const same = setPptxTexts(
      page,
      answers(page, {}, { faces: { ...one, "0:c:—": "Hiragino Sans" } }),
    );
    expect(same.boxes[0]?.runs.map((each) => [each.text, each.font, each.ea])).toEqual([
      ["code 台本 — x", "Hiragino Sans", undefined],
    ]);
    const third = setPptxTexts(
      page,
      answers(page, {}, { faces: { ...one, "0:c:—": "Apple Symbols" } }),
    );
    expect(third.boxes[0]?.runs.map((each) => [each.text, each.font])).toEqual([
      ["code 台本 ", "Hiragino Sans"],
      ["—", "Apple Symbols"],
      [" x", "Hiragino Sans"],
    ]);
  });

  test("keeps the style's letter spacing where places or widths are not known", () => {
    const spacing = (page: PptxPageTexts, given = answers(page)) =>
      spaced(setPptxTexts(page, given).boxes[0]?.runs);
    const unplaced = texts([
      { ...box("かな", undefined), runs: [run("かな", { letterSpacing: 2 })] },
    ]);
    expect(spacing(unplaced)).toEqual([["かな", 2]]);
    // A script whose letters join is not as wide a letter at a time.
    const joined = texts([box("سلام", [0, 8, 16, 24, 32])]);
    expect(spacing(joined)).toEqual([["سلام", 0]]);
    // No width for a character, and no plain line.
    const unmeasured = texts([box("かな", [0, 16, 32])]);
    expect(spacing(unmeasured, { faces: new Map(), glyphs: [], lines: [] })).toEqual([["かな", 0]]);
  });

  test("spaces a block's paragraph as its lines were spaced, a break's space as its style says", () => {
    const paragraph: PptxBlockText = {
      node: 0,
      runs: [run("かな、 字\n字")],
      align: "left",
      lineHeight: 32,
      content: { left: 0, top: 0, right: 200, bottom: 64 },
      textIndent: 0,
    };
    // The first line broke at its space, which is in no box.
    const page = texts(
      [box("かな、", [0, 20, 40, 50]), box("字", [0, 20]), box("字", [0, 20])],
      [paragraph],
    );
    const set = setPptxTexts(page, answers(page, { "、": [20, 10] }));
    expect(spaced(set.blocks[0]?.runs)).toEqual([
      ["かな", 0],
      ["、", -10],
      [" 字\n字", 0],
    ]);

    // A line of the block that could not be spaced leaves the whole paragraph as its style says.
    const partly = texts(
      [box("かな、", [0, 20, 40, 50]), box("字", undefined), box("字", [0, 20])],
      [paragraph],
    );
    expect(
      spaced(setPptxTexts(partly, answers(partly, { "、": [20, 10] })).blocks[0]?.runs),
    ).toEqual([["かな、 字\n字", 0]]);
  });
});

describe("the name a face is written by", () => {
  const probe = (id: string, weight: string, more: Partial<PptxFaceProbe["use"]> = {}) => ({
    id,
    use: { ...use(), weight, ...more },
    text: "Aa",
  });
  const face = (postScript: string, family = "Hiragino Sans", custom = false): PptxFace => ({
    family,
    postScript,
    custom,
  });
  /** What the page drew: the probe itself, then the same text at each weight given. */
  const drawn = (id: string, own: PptxFace, sides: Record<string, PptxFace> = {}) =>
    new Map<string, PptxFace>([
      [id, own],
      ...Object.entries(sides).map(([weight, each]): [string, PptxFace] => [
        `${id}@${weight}`,
        each,
      ]),
    ]);

  test("asks for the same text at each other weight on the probe's side of bold", () => {
    // A run says only whether it is bold: which face that is, a renderer decides.
    const regular = pptxSideProbes([probe("0:latin", "400")]);
    expect(regular.map((each) => [each.id, each.use.weight, each.text])).toEqual([
      ["0:latin@100", "100", "Aa"],
      ["0:latin@200", "200", "Aa"],
      ["0:latin@300", "300", "Aa"],
      ["0:latin@500", "500", "Aa"],
    ]);
    expect(pptxSideProbes([probe("0:c:—", "700")]).map((each) => each.use.weight)).toEqual([
      "600",
      "800",
      "900",
    ]);
    // A weight between two of them is on a side all the same.
    expect(pptxSideProbes([probe("1:eastAsian", "650")]).map((each) => each.use.weight)).toEqual([
      "600",
      "700",
      "800",
      "900",
    ]);
  });

  test("asks nothing of text set aslant or along an axis, which no name alone finds", () => {
    expect(pptxSideProbes([probe("0:latin", "400", { style: "italic" })])).toEqual([]);
    expect(
      pptxSideProbes([probe("0:latin", "400", { axes: 'font-variation-settings: "wght" 450;' })]),
    ).toEqual([]);
  });

  test("asks which name finds a face whose family drew another on its side of bold", () => {
    const asked = [probe("0:latin", "400"), probe("1:latin", "700")];
    const found = new Map([
      ...drawn("0:latin", face("HiraginoSans-W4"), {
        "300": face("HiraginoSans-W3"),
        "500": face("HiraginoSans-W5"),
      }),
      // One face for everything bold: `b` can mean no other.
      ...drawn("1:latin", face("HelveticaNeue-Bold", "Helvetica Neue"), {
        "600": face("HelveticaNeue-Bold", "Helvetica Neue"),
        "900": face("HelveticaNeue-Bold", "Helvetica Neue"),
      }),
    ]);
    expect(pptxNameProbes(asked, found).map((each) => [each.id, each.local])).toEqual([
      ["0:latin#0", "Hiragino Sans"],
      ["0:latin#1", "Hiragino Sans W4"],
      ["0:latin#2", "HiraginoSans-W4"],
    ]);
    // The style's words apart, as a full name has them.
    const demi = drawn("0:latin", face("AvenirNext-DemiBold", "Avenir Next"), {
      "700": face("AvenirNext-Bold", "Avenir Next"),
    });
    expect(pptxNameProbes([probe("0:latin", "600")], demi).map((each) => each.local)).toEqual([
      "Avenir Next",
      "Avenir Next DemiBold",
      "Avenir Next Demi Bold",
      "AvenirNext-DemiBold",
    ]);
  });

  test("writes the family where it has one face on that side, and else the first name that finds the face", () => {
    const asked = [probe("0:latin", "400"), probe("0:eastAsian", "400"), probe("1:latin", "700")];
    const found = new Map([
      ...drawn("0:latin", face("HelveticaNeue", "Helvetica Neue"), {
        "500": face("HelveticaNeue-Medium", "Helvetica Neue"),
      }),
      ...drawn("0:eastAsian", face("HiraginoSans-W4"), { "300": face("HiraginoSans-W3") }),
      ...drawn("1:latin", face("Menlo-Bold", "Menlo"), { "600": face("Menlo-Bold", "Menlo") }),
    ]);
    const named = new Map<string, PptxFace>([
      // The regular face of a family goes by the family's name.
      ["0:latin#0", face("HelveticaNeue", "Helvetica Neue")],
      // A family's name finds no face of it, or another: the full name finds this one.
      ["0:eastAsian#0", face("Times-Roman", "Times")],
      ["0:eastAsian#1", face("HiraginoSans-W4")],
      ["0:eastAsian#2", face("HiraginoSans-W4")],
    ]);
    expect([...pptxFaceNames(asked, found, named)]).toEqual([
      ["0:latin", "Helvetica Neue"],
      ["0:eastAsian", "Hiragino Sans W4"],
      ["1:latin", "Menlo"],
    ]);
  });

  test("keeps the family where no name finds the face, for a font the page brought, and for another family's face", () => {
    const asked = [probe("0:latin", "400"), probe("1:latin", "400"), probe("2:latin", "400")];
    const found = new Map([
      ...drawn("0:latin", face("HiraginoSans-W4"), { "300": face("HiraginoSans-W3") }),
      ...drawn("1:latin", face("Inter-Regular", "Inter", true), {
        "300": face("Inter-Light", "Inter", true),
      }),
      // At another weight the stack fell through to another family: that says nothing of this one.
      ...drawn("2:latin", face("Menlo-Regular", "Menlo"), { "300": face("HiraginoSans-W3") }),
    ]);
    expect(pptxNameProbes(asked, found).map((each) => each.id)).toEqual([
      "0:latin#0",
      "0:latin#1",
      "0:latin#2",
    ]);
    expect([...pptxFaceNames(asked, found, new Map())]).toEqual([
      ["0:latin", "Hiragino Sans"],
      ["1:latin", "Inter"],
      ["2:latin", "Menlo"],
    ]);
    // A probe the page drew nothing for is not named at all.
    expect([...pptxFaceNames([probe("9:latin", "400")], found, new Map())]).toEqual([]);
  });
});
