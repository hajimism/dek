import type { PptxBlockText, PptxMeasuredBox, PptxMeasuredRun } from "./pptx-plan.ts";
import type { PptxFaceProbe, PptxGlyphRequest, PptxPageTexts, PptxPlainLine } from "./pptx-text.ts";

// How the text a page measured is set again in PowerPoint, decided from the measurements alone:
// which face each character names, and the spacing after each character that puts the next one
// where the browser put it. PowerPoint applies none of a text's OpenType features, so a line set
// in the same font at the same size comes out as long as its characters' own widths, kerned,
// add up to; what the browser did besides, `palt`'s proportional kana and punctuation, the
// trimming of punctuation that meets, justification, and letter spacing, is written as character
// spacing, the way a designer tightens a line in PowerPoint by hand. Kerning between Latin
// letters is the renderer's, in neither the plain line the spacing is measured against nor the
// spacing; kerning next to an East Asian character, which a renderer does not do, is in the
// spacing (ADR 98).

/** How PowerPoint tells a character's script, which decides the face it draws it in. */
type Script = "latin" | "eastAsian" | "other";

/**
 * The script PowerPoint takes a character for: Latin for ASCII and the Latin letters, East Asian
 * for kana, ideographs, Hangul, and the full-width forms and punctuation set with them. Anything
 * else, a dash, an arrow, a symbol, a letter of another script, is one PowerPoint may give to
 * either face, by the text's language and its own tables, so it is `other` and named on its own.
 */
export function scriptOf(grapheme: string): Script {
  const code = grapheme.codePointAt(0) ?? 0;
  if (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xc0 && code <= 0x24f && code !== 0xd7 && code !== 0xf7)
  ) {
    return "latin";
  }
  if (
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0xa960 && code <= 0xa97f) ||
    (code >= 0xac00 && code <= 0xd7ff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0x1b000 && code <= 0x1b16f) ||
    (code >= 0x20000 && code <= 0x3ffff)
  ) {
    return "eastAsian";
  }
  return "other";
}

/** Scripts whose letters join or stack, so that one alone is not as wide as it is in a word. */
const SHAPED = /[֐-ࣿऀ-෿฀-࿿က-႟ក-᢯]/u;

/** Opening brackets and quotes set full-width: their ink is on the right of their box. */
const OPENING = /^[（〔［｛〈《「『【〘〖〝‘“｟]$/u;
/** Closing brackets, commas, and full stops set full-width: their ink is on the left. */
const CLOSING = /^[）〕］｝〉》」』】〙〗〟’”｠、。，．]$/u;

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const graphemesOf = (text: string): string[] =>
  [...segmenter.segment(text)].map((each) => each.segment);
const isSpace = (grapheme: string) => /^[ \t\n\r\f]+$/.test(grapheme);

/**
 * The script of a character a face draws: none for white space, which is drawn in whatever face
 * the text beside it is, so it says nothing of which face a run is in.
 */
export function drawnScriptOf(grapheme: string): Script | undefined {
  return isSpace(grapheme) ? undefined : scriptOf(grapheme);
}

/**
 * What is asked of the page to set a slide's text: probes for faces, characters to measure
 * alone, and each box's line to set again plainly, in the boxes' order, empty for a box whose
 * characters the page did not place.
 */
export type PptxTypeRequests = {
  faces: PptxFaceProbe[];
  glyphs: PptxGlyphRequest[];
  lines: PptxPlainLine[];
};

/** How many characters of one script stand for it when its face is asked for. */
const SAMPLE = 48;

/** A probe's id: the use, then the script, or `c` and the character itself. */
const faceId = (use: number, of: "latin" | "eastAsian" | { char: string }): string =>
  typeof of === "string" ? `${use}:${of}` : `${use}:c:${of.char}`;

/**
 * What the page is asked for the slide's text: for each way text is set, a probe of its Latin
 * characters, one of its East Asian ones, and one for each other character, to learn the face
 * that drew them; and each character at each size, to learn its width.
 */
export function pptxTypeRequests(texts: PptxPageTexts): PptxTypeRequests {
  const scripts = texts.uses.map(() => ({
    latin: new Set<string>(),
    eastAsian: new Set<string>(),
    other: new Set<string>(),
  }));
  const sized = new Map<string, { use: number; size: number; graphemes: Set<string> }>();
  const runs = [
    ...texts.boxes.flatMap((box) => box.runs),
    ...texts.blocks.flatMap((block) => block.runs),
  ];
  for (const run of runs) {
    const key = `${run.use}@${run.size}`;
    const at = sized.get(key) ?? { use: run.use, size: run.size, graphemes: new Set<string>() };
    sized.set(key, at);
    for (const grapheme of graphemesOf(run.text)) {
      if (grapheme === "\n") {
        continue;
      }
      at.graphemes.add(grapheme);
      if (!isSpace(grapheme)) {
        scripts[run.use]?.[scriptOf(grapheme)].add(grapheme);
      }
    }
  }
  const faces: PptxFaceProbe[] = [];
  texts.uses.forEach((use, index) => {
    const found = scripts[index];
    if (!found) {
      return;
    }
    for (const script of ["latin", "eastAsian"] as const) {
      if (found[script].size > 0) {
        faces.push({
          id: faceId(index, script),
          use,
          text: [...found[script]].slice(0, SAMPLE).join(""),
        });
      }
    }
    for (const char of found.other) {
      faces.push({ id: faceId(index, { char }), use, text: char });
    }
  });
  const glyphs: PptxGlyphRequest[] = [];
  for (const { use, size, graphemes } of sized.values()) {
    const set = texts.uses[use];
    if (set) {
      glyphs.push({ use: set, size, graphemes: [...graphemes] });
    }
  }
  const lines = texts.boxes.map(
    (box): PptxPlainLine =>
      box.stops
        ? box.runs.flatMap((run) => {
            const use = texts.uses[run.use];
            return use ? [{ use, size: run.size, text: run.text }] : [];
          })
        : [],
  );
  return { faces, glyphs, lines };
}

/**
 * The face Chromium drew a probe's text in: its family, its own name as the font file has it,
 * and whether the page brought the font, which a recipient then does not have.
 */
export type PptxFace = { family: string; postScript: string; custom: boolean };

/**
 * The weights CSS has on each side of bold. A run says only which side it is on, with `b`, and
 * which face that is a renderer decides: of Hiragino Sans, PowerPoint for Mac draws W3 and W6
 * where Chromium drew W4 at 400 and W7 at 700, and Quick Look W4 and W7 (ADR 100).
 */
const REGULAR_SIDE = ["100", "200", "300", "400", "500"];
const BOLD_SIDE = ["600", "700", "800", "900"];
const sideOf = (weight: string): string[] => (Number(weight) >= 600 ? BOLD_SIDE : REGULAR_SIDE);

const sideId = (id: string, weight: string): string => `${id}@${weight}`;
const nameId = (id: string, at: number): string => `${id}#${at}`;

/**
 * Whether a name alone could find the face a probe's text was drawn in: not where it is set
 * aslant, which a run says with `i` as it says bold with `b`, nor where an axis picks the outlines.
 */
const nameable = (probe: PptxFaceProbe): boolean =>
  probe.use.style === "normal" && probe.use.axes === "";

/**
 * For each probe, its text at each other weight on its side of bold: where a family drew them
 * all in one face, `b` can mean no other, and where it drew several, the run names its own.
 */
export function pptxSideProbes(probes: PptxFaceProbe[]): PptxFaceProbe[] {
  return probes.flatMap((probe) =>
    nameable(probe)
      ? sideOf(probe.use.weight)
          .filter((weight) => weight !== probe.use.weight)
          .map((weight) => ({
            ...probe,
            id: sideId(probe.id, weight),
            use: { ...probe.use, weight },
          }))
      : [],
  );
}

/** Whether the family that drew a probe drew its text in another face on the same side of bold. */
function severalOnSide(
  probe: PptxFaceProbe,
  face: PptxFace,
  drawn: ReadonlyMap<string, PptxFace>,
): boolean {
  if (face.custom || face.postScript === "" || !nameable(probe)) {
    return false;
  }
  return sideOf(probe.use.weight).some((weight) => {
    const other = drawn.get(sideId(probe.id, weight));
    return (
      other !== undefined && other.family === face.family && other.postScript !== face.postScript
    );
  });
}

/**
 * The names a face may go by, the one a font menu shows first: its family's, as a family's
 * regular face is named; its full name, the family's with the style after it, as the font file
 * writes the style and with its words apart; and the font file's own name for it.
 */
function faceNames(face: PptxFace): string[] {
  const dash = face.postScript.indexOf("-");
  const style = dash < 0 ? "" : face.postScript.slice(dash + 1);
  const full =
    style === ""
      ? []
      : [`${face.family} ${style}`, `${face.family} ${style.replace(/([a-z])([A-Z])/g, "$1 $2")}`];
  return [...new Set([face.family, ...full, face.postScript])];
}

/**
 * For each probe whose family drew several faces on its side of bold, a probe of each name its
 * face may go by, set in whatever face that name alone finds: the page says which one it is.
 */
export function pptxNameProbes(
  probes: PptxFaceProbe[],
  drawn: ReadonlyMap<string, PptxFace>,
): PptxFaceProbe[] {
  return probes.flatMap((probe) => {
    const face = drawn.get(probe.id);
    return face && severalOnSide(probe, face, drawn)
      ? faceNames(face).map((local, at) => ({ ...probe, id: nameId(probe.id, at), local }))
      : [];
  });
}

/**
 * What each probe's face is written as: its family, with `b` to say the side, where the family
 * has one face there; where it has several, the first name that found the face again; and the
 * family where none did, as before ADR 100.
 */
export function pptxFaceNames(
  probes: PptxFaceProbe[],
  drawn: ReadonlyMap<string, PptxFace>,
  named: ReadonlyMap<string, PptxFace>,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const probe of probes) {
    const face = drawn.get(probe.id);
    if (!face) {
      continue;
    }
    const own = severalOnSide(probe, face, drawn)
      ? faceNames(face).find(
          (_, at) => named.get(nameId(probe.id, at))?.postScript === face.postScript,
        )
      : undefined;
    names.set(probe.id, own ?? face.family);
  }
  return names;
}

/**
 * What the page answered: each probe's face by its id, each request's widths in its order, and
 * for each box's plain line where each of its characters starts and where the last ends.
 */
export type PptxTypeAnswers = {
  faces: ReadonlyMap<string, string>;
  glyphs: Array<{ natural: number[]; featured: number[] }>;
  lines: number[][];
};

/** How far, in pixels, a character may stand from where the browser put it before it is moved. */
const TOLERANCE = 0.25;
/** The same as a share of the type's size, for large type: a hundredth of an em and a bit. */
const TOLERANCE_OF_SIZE = 0.012;

/** DrawingML's unit of character spacing, a hundredth of a point, in pixels. */
const SPACING_UNIT = 1 / 75;

type Glyph = {
  text: string;
  /** The run it is of, by its place in the box or the block. */
  run: number;
  /** The face it names, and whether that is the only face it can name. */
  font: string | undefined;
  ea: string | undefined;
  alone: boolean;
  /** The spacing after it. */
  spacing: number;
};

/**
 * The text as it is written: each box's and each block's runs naming the face that drew their
 * Latin and the face that drew their East Asian characters, a character PowerPoint may give to
 * either in a run of its own that names only the face that drew it, and after each character the
 * spacing that sets the next one where the browser set it. A box whose first character the
 * browser drew left of where its own box starts, as `palt` draws an opening bracket, says by how
 * much, for the box to start there. Text whose characters' places or widths are not known keeps
 * the letter spacing its style says.
 */
export function setPptxTexts(texts: PptxPageTexts, answers: PptxTypeAnswers): PptxPageTexts {
  const requests = pptxTypeRequests(texts);
  const widths = new Map<string, { natural: number; featured: number }>();
  requests.glyphs.forEach((request, index) => {
    const use = texts.uses.indexOf(request.use);
    request.graphemes.forEach((grapheme, at) => {
      const natural = answers.glyphs[index]?.natural[at];
      const featured = answers.glyphs[index]?.featured[at];
      if (natural !== undefined && featured !== undefined) {
        widths.set(`${use}@${request.size}:${grapheme}`, { natural, featured });
      }
    });
  });
  const faceOf = (
    use: number,
    grapheme: string,
    before: Script | undefined,
  ): Pick<Glyph, "font" | "ea" | "alone"> => {
    const latin = answers.faces.get(faceId(use, "latin"));
    const eastAsian = answers.faces.get(faceId(use, "eastAsian"));
    // A use with one script names its one face for both: text typed into it is set in that.
    const pair = { font: latin ?? eastAsian, ea: eastAsian ?? latin, alone: false };
    if (grapheme === "\n" || scriptOf(grapheme) === "eastAsian") {
      return pair;
    }
    if (isSpace(grapheme)) {
      // The browser draws a space in the first face that has one, the Latin's. A renderer gives
      // a space to the face of what it follows, so one that follows East Asian text, or a
      // character named alone, is named alone. One that starts a line follows nothing, and stays
      // with the text after it: Quick Look drops a space from a run of nothing but an indent.
      return pair.font === pair.ea || before === "latin" || before === undefined
        ? pair
        : { font: pair.font, ea: pair.font, alone: true };
    }
    if (scriptOf(grapheme) === "latin") {
      return pair;
    }
    // Any other character is named alone, in the face that drew it, unless whichever face
    // PowerPoint gives it to is that one.
    const own = answers.faces.get(faceId(use, { char: grapheme })) ?? pair.font;
    return own === pair.font && own === pair.ea ? pair : { font: own, ea: own, alone: true };
  };

  /** The glyphs of some runs with their faces, each spaced as its run's style says. */
  const glyphsOf = (runs: PptxMeasuredRun[]): Glyph[] => {
    // The script of the character before, white space apart; none at the start of a line.
    let before: Script | undefined;
    return runs.flatMap((run, index) =>
      graphemesOf(run.text).map((text): Glyph => {
        const face = faceOf(run.use, text, before);
        if (text === "\n") {
          before = undefined;
        } else if (!isSpace(text)) {
          before = scriptOf(text);
        }
        return { text, run: index, ...face, spacing: run.letterSpacing };
      }),
    );
  };

  /** The runs again, cut wherever the face or the spacing changes. */
  const runsOf = (runs: PptxMeasuredRun[], glyphs: Glyph[]): PptxMeasuredRun[] => {
    const out: Array<{ run: PptxMeasuredRun; of: Glyph }> = [];
    for (const glyph of glyphs) {
      const from = runs[glyph.run];
      if (!from) {
        continue;
      }
      const last = out.at(-1);
      // A line break carries no face or spacing of its own: it stays in the run it is in.
      const joins =
        last !== undefined &&
        last.of.run === glyph.run &&
        (glyph.text === "\n" ||
          (last.of.font === glyph.font &&
            last.of.ea === glyph.ea &&
            last.of.alone === glyph.alone &&
            last.of.spacing === glyph.spacing));
      if (last && joins) {
        last.run.text += glyph.text;
        continue;
      }
      const { family, font: _font, ea: _ea, ...rest } = from;
      out.push({
        run: {
          ...rest,
          text: glyph.text,
          letterSpacing: glyph.spacing,
          ...(glyph.font === undefined ? {} : { font: glyph.font }),
          ...(glyph.ea === undefined || glyph.ea === glyph.font ? {} : { ea: glyph.ea }),
          // A character named on its own is in that face whatever the theme's fonts become.
          ...(family === undefined || glyph.alone ? {} : { family }),
        },
        of: glyph,
      });
    }
    return out.map(({ run }) => run);
  };

  /**
   * Spaces a box's glyphs so each starts where the browser started it, and answers how far left
   * of the box the first one's ink starts; nothing when the places or the widths are not known.
   * `plain` is the box's line set again with no feature and no spacing, kerned: where each of
   * its characters starts and the last ends.
   */
  const space = (
    box: PptxMeasuredBox,
    glyphs: Glyph[],
    plain: number[] | undefined,
  ): number | undefined => {
    const { stops } = box;
    if (
      !stops ||
      stops.length !== glyphs.length + 1 ||
      glyphs.some((each) => SHAPED.test(each.text))
    ) {
      return undefined;
    }
    const measured = glyphs.map((glyph) => {
      const run = box.runs[glyph.run];
      return run ? widths.get(`${run.use}@${run.size}:${glyph.text}`) : undefined;
    });
    // How far PowerPoint moves on after each glyph, before any spacing. Between two characters
    // neither of which is East Asian, that is the plain line's advance, kerning included: a
    // renderer kerns Latin as the browser does, so that kerning is its own to add. Next to an
    // East Asian character it is the glyph's width alone: the browser kerns kana where a
    // renderer does not, so there the kerning is in the spacing.
    const advances = glyphs.map((glyph, at) => {
      const next = glyphs[at + 1];
      const alone = measured[at]?.natural;
      const kerned =
        plain?.length === stops.length ? (plain[at + 1] ?? 0) - (plain[at] ?? 0) : undefined;
      const latin =
        next !== undefined &&
        scriptOf(glyph.text) !== "eastAsian" &&
        scriptOf(next.text) !== "eastAsian";
      return latin ? (kerned ?? alone) : (alone ?? kerned);
    });
    if (advances.some((each) => each === undefined)) {
      return undefined;
    }
    // Where each glyph is to start: where the browser started its box, less what a feature took
    // from the left of its ink, which PowerPoint's glyph still has.
    const targets = glyphs.map((glyph, at) => {
      const run = box.runs[glyph.run];
      const width = measured[at];
      const [from = 0, to = 0] = [stops[at], stops[at + 1]];
      if (!run || !width) {
        return from;
      }
      const feature = Math.min(0, width.featured - width.natural);
      // What the browser took from it besides, where it meets another punctuation mark.
      const met = to - from - run.letterSpacing - width.featured;
      const share = OPENING.test(glyph.text) ? 1 : CLOSING.test(glyph.text) ? 0 : 0.5;
      const trimmed = OPENING.test(glyph.text) && met < -run.size * 0.2 ? met : 0;
      return from + share * feature + trimmed;
    });
    // Each glyph is spaced so the next starts at its target, to within a tolerance: by what its
    // style says where that will do, else by what the glyph before it got, so that runs stay
    // whole, else exactly. The pen is where PowerPoint has come to, so nothing adds up.
    let pen = targets[0] ?? 0;
    let before: { run: number; spacing: number } | undefined;
    glyphs.forEach((glyph, at) => {
      const run = box.runs[glyph.run];
      const natural = advances[at] ?? 0;
      const next = targets[at + 1] ?? stops[at + 1] ?? pen;
      const exact = next - pen - natural;
      const base = run?.letterSpacing ?? 0;
      const near = Math.max(TOLERANCE, (run?.size ?? 0) * TOLERANCE_OF_SIZE);
      glyph.spacing =
        Math.abs(exact - base) <= near
          ? base
          : before?.run === glyph.run && Math.abs(exact - before.spacing) <= near
            ? before.spacing
            : Math.round(exact / SPACING_UNIT) * SPACING_UNIT;
      before = { run: glyph.run, spacing: glyph.spacing };
      pen += natural + glyph.spacing;
    });
    return (targets[0] ?? 0) - (stops[0] ?? 0);
  };

  /** Each block's glyphs as its boxes spaced them, in reading order, to space its paragraph by. */
  const spaced = new Map<number, Glyph[] | null>();
  const boxes = texts.boxes.map((box, index): PptxMeasuredBox => {
    const glyphs = glyphsOf(box.runs);
    const shift = space(box, glyphs, answers.lines[index]);
    const stream = spaced.get(box.block);
    if (shift === undefined) {
      spaced.set(box.block, null);
    } else if (stream !== null) {
      spaced.set(box.block, [...(stream ?? []), ...glyphs]);
    }
    const { stops: _stops, ...rest } = box;
    return {
      ...rest,
      runs: runsOf(box.runs, glyphs),
      ...(shift !== undefined && Math.abs(shift) > TOLERANCE ? { shift } : {}),
    };
  });

  const blocks = texts.blocks.map((block): PptxBlockText => {
    const glyphs = glyphsOf(block.runs);
    const stream = spaced.get(block.node);
    if (stream) {
      // The block's characters are its boxes' characters, with its own white space: a space the
      // line was broken at is in no box, and keeps the spacing its style says.
      let at = 0;
      const set = glyphs.map((glyph) => {
        if (glyph.text === "\n") {
          return glyph.spacing;
        }
        if (isSpace(glyph.text)) {
          const here = stream[at];
          if (here && isSpace(here.text)) {
            at++;
            return here.spacing;
          }
          return glyph.spacing;
        }
        while (stream[at] && isSpace(stream[at]?.text ?? "")) {
          at++;
        }
        const here = stream[at];
        if (here?.text !== glyph.text) {
          return undefined;
        }
        at++;
        return here.spacing;
      });
      if (set.every((spacing) => spacing !== undefined)) {
        glyphs.forEach((glyph, index) => {
          glyph.spacing = set[index] ?? glyph.spacing;
        });
      }
    }
    return { ...block, runs: runsOf(block.runs, glyphs) };
  });
  return { ...texts, boxes, blocks };
}
