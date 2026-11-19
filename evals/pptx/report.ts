import type { SlideCensus } from "./census.ts";
import type { LineFinding } from "./compare.ts";
import type { PackageSlide } from "./package.ts";

// What the eval says of a file, slide by slide and deck by deck: how much of what the slide shows
// is PowerPoint's own and how it can be edited, read from the file; and how close a renderer
// draws it to the browser, measured line by line.

/** How a slide's text can be edited in the file, in characters, white space left out. */
type TextReport = {
  /** What the slide shows that is not decoration: its HTML's text and its pseudo-elements'. */
  shown: number;
  /** Of that, what `::before` and `::after` draw. */
  pseudo: number;
  /** Text under `aria-hidden`, which is not counted as shown. */
  decoration: number;
  /** Text the file holds as text, at most what is shown. */
  native: number;
  /** Text whose whole block is one paragraph of the file, so it is selected and retyped as one. */
  whole: number;
  /** Of the whole blocks, text in a box that wraps what is typed into it. */
  wrapping: number;
  /** The file's text boxes and the runs in them. */
  bodies: number;
  runs: number;
};

/** Why a line's end is off: the renderer broke the line again, or its width came out other. */
type Cause = "rewrapped" | "mixed" | "east-asian" | "other";

/** A line of the slide as a renderer set it, against the browser. */
type LineReport = {
  /** Where the browser set it, in the slide's pixels: left, top, right, bottom. */
  box: [number, number, number, number];
  chars: number;
  kind: "html" | "pseudo";
  script: "east-asian" | "other" | "mixed";
  /** Whether the renderer set it as text; the rest is only for a line it did. */
  native: boolean;
  /** How far its end and its top are from the browser's, in pixels, and how much ink coincides. */
  drift: number;
  rise: number;
  match: number;
  /** Set on a line whose end is more than a pixel and more than 1% of its width off. */
  cause?: Cause;
};

export type SlideReport = {
  slug: string;
  text: TextReport;
  shapes: number;
  pictures: number;
  described: number;
  groups: number;
  effects: number;
  /** Slide-sized pictures left under or over what is PowerPoint's own, and the share they cover. */
  rasters: number;
  /** Whether its background is a picture, decoration the recipient changes in Format Background. */
  backdrop: boolean;
  coverage: number;
  title: boolean;
  numbered: boolean;
  links: { shown: number; kept: number };
  heading: boolean;
  notes: boolean;
  /** What the renderer drew: its lines, and the whole picture against the browser's. */
  render?: { lines: LineReport[]; difference: number; differing: number };
};

export type DeckReport = {
  deck: string;
  exportMs: number;
  bytes: number;
  xmlBytes: number;
  mediaBytes: number;
  core: { title: boolean; creator: boolean; created: boolean };
  problems: string[];
  slides: SlideReport[];
};

export type EvalReport = {
  startedAt: string;
  /** The renderer the lines were measured in; none where there was none to ask. */
  renderer: string | null;
  /** The file measured, when it is not one `dekc pptx` wrote: its export time is then none. */
  producer?: string;
  decks: DeckReport[];
};

/** A slide's report from what the browser showed and what the file holds. */
export function slideReport(
  slug: string,
  census: SlideCensus,
  slide: PackageSlide,
  measured: { coverage: number; lines?: LineFinding[]; difference?: number; differing?: number },
): SlideReport {
  const paragraphs = slide.bodies.flatMap((body) =>
    body.paragraphs.map((paragraph) => ({ ...paragraph, wrap: body.wrap })),
  );
  const shown = census.chars.html + census.chars.pseudo;
  const written = paragraphs.reduce((sum, paragraph) => sum + [...paragraph.ink].length, 0);
  // A block is whole when one paragraph carries exactly its text; each paragraph answers once.
  const free = new Map<string, boolean[]>();
  for (const paragraph of paragraphs) {
    free.set(paragraph.ink, [...(free.get(paragraph.ink) ?? []), paragraph.wrap]);
  }
  let whole = 0;
  let wrapping = 0;
  for (const block of census.blocks) {
    const wraps = free.get(block.ink)?.shift();
    if (wraps === undefined) {
      continue;
    }
    whole += [...block.ink].length;
    wrapping += wraps ? [...block.ink].length : 0;
  }
  const found = measured.lines;
  return {
    slug,
    text: {
      shown,
      pseudo: census.chars.pseudo,
      decoration: census.chars.decoration,
      native: Math.min(shown, written),
      whole: Math.min(shown, whole),
      wrapping: Math.min(shown, wrapping),
      bodies: slide.bodies.length,
      runs: paragraphs.reduce((sum, paragraph) => sum + paragraph.runs, 0),
    },
    shapes: slide.shapes,
    pictures: slide.pictures,
    described: slide.described,
    groups: slide.groups,
    effects: slide.effects,
    rasters: slide.rasters.length,
    backdrop: slide.backdrop !== undefined,
    coverage: measured.coverage,
    title: slide.bodies.some((body) => /^(ctrTitle|title)$/.test(body.placeholder ?? "")),
    numbered: slide.fields.includes("slidenum"),
    links: { shown: census.links, kept: slide.links },
    heading: census.heading,
    notes: slide.notes,
    ...(found
      ? {
          render: {
            lines: census.lines.flatMap((line, index): LineReport[] => {
              const each = found[index];
              if (line.kind === "decoration" || !each) {
                return [];
              }
              const script =
                line.eastAsian && line.other ? "mixed" : line.eastAsian ? "east-asian" : "other";
              const width = Math.max(1, line.right - line.left);
              const off = Math.abs(each.right) > 1 && Math.abs(each.right) / width > 0.01;
              // A line that ends early with ink under it, where the browser had none, was broken again.
              const rewrapped = each.right <= -0.3 * (line.bottom - line.top) && each.spill > 0.02;
              return [
                {
                  box: [line.left, line.top, line.right, line.bottom].map(
                    (value) => Math.round(value * 10) / 10,
                  ) as LineReport["box"],
                  chars: line.chars,
                  kind: line.kind,
                  script,
                  native: each.native,
                  drift: each.right,
                  rise: each.top,
                  match: Math.round(each.match * 1000) / 1000,
                  ...(each.native && off ? { cause: rewrapped ? "rewrapped" : script } : {}),
                },
              ];
            }),
            difference: measured.difference ?? 0,
            differing: measured.differing ?? 0,
          },
        }
      : {}),
  };
}

/** One deck's numbers, or all decks' together: what a record keeps and the summary table shows. */
export type Summary = {
  deck: string;
  slides: number;
  megabytes: number;
  exportSeconds: number;
  /** Shares of the text shown, 0..1. */
  native: number;
  whole: number;
  wrapping: number;
  /**
   * One number for how the text can be edited: a character in a wrapping whole block counts 1,
   * in another whole block 0.7, in a line or a piece of one 0.4, and in a picture 0.
   */
  editability: number;
  /** Runs for each character the file holds as text: 1 would be a run a character. */
  runsPerChar: number;
  shapes: number;
  pictures: number;
  effects: number;
  /** Slides that keep a slide-sized picture, and the mean share of the slide it covers. */
  rasterSlides: number;
  coverage: number;
  /** Slides whose background is a picture. */
  backdropSlides: number;
  /** Slides with a heading whose file has a title placeholder, of those with a heading. */
  titled: number | null;
  /** Slides whose file numbers itself with a field. */
  numbered: number;
  /** Links kept, of those shown; null when no slide shows one. */
  links: number | null;
  problems: number;
  /** What the renderer drew; absent where there was none. */
  render?: {
    lines: number;
    native: number;
    /** Lines whose end is more than a pixel and more than 1% of their width off, and why. */
    drifted: number;
    causes: Record<Cause, number>;
    /** The distance of a line's end from the browser's, in pixels: median, 95th percentile, worst. */
    driftMedian: number;
    drift95: number;
    driftMax: number;
    /** The same, of the line's width. */
    relative95: number;
    /** The median distance of a line's top from the browser's, in pixels. */
    riseMedian: number;
    /** The mean share of ink that coincides, 0..1. */
    match: number;
    /** The mean difference of the whole pictures, of 255. */
    difference: number;
  };
};

export function summarize(decks: DeckReport[], name: string): Summary {
  const slides = decks.flatMap((deck) => deck.slides);
  const sum = (value: (slide: SlideReport) => number) =>
    slides.reduce((total, slide) => total + value(slide), 0);
  const shown = Math.max(
    1,
    sum((slide) => slide.text.shown),
  );
  const native = sum((slide) => slide.text.native);
  const whole = sum((slide) => slide.text.whole);
  const wrapping = sum((slide) => slide.text.wrapping);
  const headed = slides.filter((slide) => slide.heading);
  const linked = sum((slide) => slide.links.shown);
  const rendered = slides.flatMap((slide) => (slide.render ? [slide.render] : []));
  const lines = rendered.flatMap((render) => render.lines);
  const set = lines.filter((line) => line.native);
  const drift = set.map((line) => Math.abs(line.drift));
  const round = (value: number, digits = 3) => Number(value.toFixed(digits));
  const count = (cause: Cause) => set.filter((line) => line.cause === cause).length;
  return {
    deck: name,
    slides: slides.length,
    megabytes: round(decks.reduce((total, deck) => total + deck.bytes, 0) / 1e6, 2),
    exportSeconds: round(decks.reduce((total, deck) => total + deck.exportMs, 0) / 1000, 1),
    native: round(native / shown),
    whole: round(whole / shown),
    wrapping: round(wrapping / shown),
    editability: round(
      (wrapping + 0.7 * (whole - wrapping) + 0.4 * Math.max(0, native - whole)) / shown,
    ),
    runsPerChar: round(sum((slide) => slide.text.runs) / Math.max(1, native)),
    shapes: sum((slide) => slide.shapes),
    pictures: sum((slide) => slide.pictures),
    effects: sum((slide) => slide.effects),
    rasterSlides: slides.filter((slide) => slide.rasters > 0).length,
    coverage: round(sum((slide) => slide.coverage) / Math.max(1, slides.length)),
    backdropSlides: slides.filter((slide) => slide.backdrop).length,
    titled:
      headed.length === 0
        ? null
        : round(headed.filter((slide) => slide.title).length / headed.length),
    numbered: slides.filter((slide) => slide.numbered).length,
    links: linked === 0 ? null : round(sum((slide) => slide.links.kept) / linked),
    problems: decks.reduce((total, deck) => total + deck.problems.length, 0),
    ...(rendered.length > 0
      ? {
          render: {
            lines: lines.length,
            native: set.length,
            drifted: set.filter((line) => line.cause !== undefined).length,
            causes: {
              rewrapped: count("rewrapped"),
              mixed: count("mixed"),
              "east-asian": count("east-asian"),
              other: count("other"),
            },
            driftMedian: round(quantile(drift, 0.5), 2),
            drift95: round(quantile(drift, 0.95), 2),
            driftMax: round(Math.max(0, ...drift), 2),
            relative95: round(
              quantile(
                set.map((line) => Math.abs(line.drift) / Math.max(1, line.box[2] - line.box[0])),
                0.95,
              ),
              4,
            ),
            riseMedian: round(
              quantile(
                set.map((line) => Math.abs(line.rise)),
                0.5,
              ),
              2,
            ),
            match: round(mean(set.map((line) => line.match))),
            difference: round(mean(rendered.map((render) => render.difference)), 2),
          },
        }
      : {}),
  };
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

const percent = (value: number | null) =>
  value === null ? "–" : `${(value * 100).toFixed(value === 1 || value === 0 ? 0 : 1)}%`;

/** The report as Markdown: a summary a deck, then every slide, the ones furthest off first. */
export function markdown(report: EvalReport): string {
  const summaries = [
    ...report.decks.map((deck) => summarize([deck], deck.deck)),
    ...(report.decks.length > 1 ? [summarize(report.decks, "all")] : []),
  ];
  const out = [
    "# PPTX eval",
    "",
    `Started ${report.startedAt}. Renderer: ${report.renderer ?? "none, so no line was measured"}.`,
    ...(report.producer
      ? [
          "",
          `Measured ${report.producer}, not a file \`dekc pptx\` wrote. Its lines were set where PowerPoint breaks them, so a line's drift says where it wrapped, not that it is wrong; read the picture's difference instead.`,
        ]
      : []),
    "",
    "## What the file holds",
    "",
    "Shares are of the characters each slide shows, white space and `aria-hidden` decoration left out.",
    "",
    "| deck | slides | MB | export s | text native | whole blocks | wrapping | editability | runs/char | shapes | pictures | effects | raster slides | raster cover | backdrop slides | titled | numbered | links | problems |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...summaries.map(
      (each) =>
        `| ${each.deck} | ${each.slides} | ${each.megabytes} | ${each.exportSeconds} | ${percent(each.native)} | ${percent(each.whole)} | ${percent(each.wrapping)} | ${each.editability.toFixed(3)} | ${each.runsPerChar.toFixed(3)} | ${each.shapes} | ${each.pictures} | ${each.effects} | ${each.rasterSlides} | ${percent(each.coverage)} | ${each.backdropSlides} | ${percent(each.titled)} | ${each.numbered} | ${percent(each.links)} | ${each.problems} |`,
    ),
    "",
  ];
  if (summaries.some((each) => each.render)) {
    out.push(
      "## How the renderer drew it",
      "",
      "A line drifts when its end is more than a pixel and more than 1% of its width from the browser's: because the renderer broke it again, or its width came out other, in a line of East Asian text, of other text, or of both.",
      "",
      "| deck | lines | set as text | drifted | rewrapped | mixed | East Asian | other | end off, median px | 95th px | worst px | 95th of width | top off, median px | ink match | picture off /255 |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
      ...summaries.flatMap((each) =>
        each.render
          ? [
              `| ${each.deck} | ${each.render.lines} | ${each.render.native} | ${each.render.drifted} | ${each.render.causes.rewrapped} | ${each.render.causes.mixed} | ${each.render.causes["east-asian"]} | ${each.render.causes.other} | ${each.render.driftMedian} | ${each.render.drift95} | ${each.render.driftMax} | ${percent(each.render.relative95)} | ${each.render.riseMedian} | ${each.render.match.toFixed(3)} | ${each.render.difference} |`,
            ]
          : [],
      ),
      "",
    );
  }
  for (const deck of report.decks) {
    out.push(`## ${deck.deck}`, "");
    for (const problem of deck.problems) {
      out.push(`- problem: ${problem}`);
    }
    out.push(
      "",
      "| slide | shown | native | whole | wrapping | bodies | runs | shapes | pictures | raster cover | lines as text | drifted | worst end px | ink match | picture off |",
      "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    );
    const set = (slide: SlideReport) => (slide.render?.lines ?? []).filter((line) => line.native);
    const worst = (slide: SlideReport) =>
      Math.max(0, ...set(slide).map((line) => Math.abs(line.drift)));
    for (const slide of [...deck.slides].sort((a, b) => worst(b) - worst(a))) {
      const render = slide.render;
      const lines = set(slide);
      out.push(
        `| ${slide.slug} | ${slide.text.shown} | ${slide.text.native} | ${slide.text.whole} | ${slide.text.wrapping} | ${slide.text.bodies} | ${slide.text.runs} | ${slide.shapes} | ${slide.pictures} | ${percent(slide.coverage)} | ${render ? `${lines.length}/${render.lines.length}` : "–"} | ${render ? lines.filter((line) => line.cause !== undefined).length : "–"} | ${render ? worst(slide).toFixed(1) : "–"} | ${render ? mean(lines.map((line) => line.match)).toFixed(3) : "–"} | ${render ? render.difference.toFixed(2) : "–"} |`,
      );
    }
    out.push("");
  }
  return `${out.join("\n")}\n`;
}
