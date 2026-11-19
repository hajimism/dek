import { existsSync } from "node:fs";
import { basename, join } from "node:path";
import { outputDir, writeInside } from "./safe-fs.ts";
import { runPiped } from "./spawn.ts";
import { zipFiles } from "./zip.ts";

// macOS Quick Look as a renderer of the file: it is on every Mac, draws a `.pptx` without
// PowerPoint, and is not Chromium, so it says how the file's own text and shapes come out where
// the browser is not there to draw them. Two of its habits are worked around here, in a copy of
// the file made for it:
//
// - It draws a file's first slide only, so the copy lists the slide to draw first.
// - It sets type in whole points: a 10.5 pt run is drawn at 10 pt, and a character spacing of
//   0.4 pt not at all, which PowerPoint does not do. So the copy is the slide magnified, every
//   length in it multiplied, until a whole point is too small to see: the picture Quick Look
//   draws of it is the same picture, without the rounding.
//
// Two more of its habits are not worked around, since the file would have to say other than it
// does. It drops one space from the start of every line, which is why `dekc pptx` leaves a line
// that starts with an indent in a box of its own. And it draws a paragraph's bullet as far left
// of the first line's start again as that start is hung left of the margin, where PowerPoint
// draws it at the start: the eval counts no bullet, so no number here says so.

const QLMANAGE = "/usr/bin/qlmanage";

/** How many times the copy is magnified: a point of rounding is then 1/24 of a slide's pixel. */
const MAGNIFIED = 32;

/** The renderer's name for a report, or nothing where there is none: off macOS. */
export async function quickLookName(): Promise<string | undefined> {
  if (process.platform !== "darwin" || !existsSync(QLMANAGE)) {
    return undefined;
  }
  const { stdout } = await runPiped(["sw_vers", "-productVersion"], {
    label: "could not read the macOS version",
    hint: "sw_vers is part of macOS",
    timeoutMs: 10_000,
  });
  return `Quick Look (macOS ${stdout.trim()})`;
}

/**
 * Draws one slide of the file, by its place in the deck from 0, `width` pixels wide, and answers
 * the PNG's path; with `bare`, the slide is drawn with its text taken out. Nothing where Quick
 * Look drew none.
 */
export async function quickLookSlide(
  files: ReadonlyMap<string, Uint8Array>,
  slide: number,
  options: { bare: boolean; width: number; dir: string; root: string },
): Promise<string | undefined> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const read = (path: string) => decoder.decode(files.get(path) ?? new Uint8Array());
  const presentation = read("ppt/presentation.xml");
  const ids = [...presentation.matchAll(/<p:sldId [^>]*\/>/g)].map((match) => match[0]);
  const first = ids[slide];
  if (first === undefined) {
    return undefined;
  }
  const relation = /r:id="([^"]+)"/.exec(first)?.[1] ?? "";
  const target = new RegExp(`<Relationship Id="${relation}"[^>]* Target="([^"]+)"`).exec(
    read("ppt/_rels/presentation.xml.rels"),
  )?.[1];
  const path = `ppt/${target}`;
  const copy = new Map(files);
  copy.set(
    "ppt/presentation.xml",
    encoder.encode(
      magnified(
        presentation.replace(
          /<p:sldIdLst>.*<\/p:sldIdLst>/s,
          `<p:sldIdLst>${[first, ...ids.filter((id) => id !== first)].join("")}</p:sldIdLst>`,
        ),
      ),
    ),
  );
  const xml = options.bare
    ? read(path)
        .replace(/<a:t>[^<]*<\/a:t>/g, "<a:t></a:t>")
        .replace(/<a:bu(Char|AutoNum)[^>]*\/>/g, "<a:buNone/>")
    : read(path);
  copy.set(path, encoder.encode(magnified(xml)));
  outputDir(options.dir, options.root);
  const file = join(options.dir, `slide-${slide + 1}${options.bare ? "-bare" : ""}.pptx`);
  writeInside(
    file,
    zipFiles([...copy].map(([name, data]) => ({ path: name, data }))),
    options.root,
  );
  await runPiped([QLMANAGE, "-t", "-s", String(options.width), "-o", options.dir, file], {
    label: "Quick Look could not draw the slide",
    hint: "qlmanage is part of macOS",
    timeoutMs: 60_000,
  });
  const png = join(options.dir, `${basename(file)}.png`);
  return existsSync(png) ? png : undefined;
}

/**
 * A slide's or a presentation's XML with every length in it multiplied: places and extents,
 * line widths, insets, margins, type sizes, spacings, and a table's columns and rows, as dek's
 * writer writes them. What is a share of something else, an angle, or a color stays.
 */
export function magnified(xml: string, by = MAGNIFIED): string {
  const times = (value: string) => String(Math.round(Number(value) * by));
  const counted = { place: 0, extent: 0, size: 0, grid: 0 };
  const out = xml
    .replace(
      /<(a:off|a:chOff) x="(-?\d+)" y="(-?\d+)"\/>/g,
      (_, tag: string, x: string, y: string) => {
        counted.place++;
        return `<${tag} x="${times(x)}" y="${times(y)}"/>`;
      },
    )
    .replace(
      /<(a:ext|a:chExt|p:sldSz) cx="(\d+)" cy="(\d+)"\/>/g,
      (_, tag: string, cx: string, cy: string) => {
        counted.extent++;
        return `<${tag} cx="${times(cx)}" cy="${times(cy)}"/>`;
      },
    )
    .replace(
      /<(a:ln|a:lnL|a:lnR|a:lnT|a:lnB) w="(\d+)"/g,
      (_, tag: string, w: string) => `<${tag} w="${times(w)}"`,
    )
    .replace(/<(a:gridCol w|a:tr h)="(\d+)"/g, (_, tag: string, value: string) => {
      counted.grid++;
      return `<${tag}="${times(value)}"`;
    })
    .replace(
      /\b(lIns|tIns|rIns|bIns|marL|marR|marT|marB|indent|blurRad|dist|rad)="(-?\d+)"/g,
      (_, name: string, value: string) => `${name}="${times(value)}"`,
    )
    .replace(
      /<a:spcPts val="(-?\d+)"\/>/g,
      (_, value: string) => `<a:spcPts val="${times(value)}"/>`,
    )
    .replace(/<a:(rPr|endParaRPr|defRPr) ([^>]*)>/g, (_, tag: string, attributes: string) => {
      const scaled = attributes.replace(
        /\b(sz|spc)="(-?\d+)"/g,
        (__, name: string, value: string) => {
          counted.size += name === "sz" ? 1 : 0;
          return `${name}="${times(value)}"`;
        },
      );
      return `<a:${tag} ${scaled}>`;
    });
  // The patterns follow how `dekc pptx` writes these today. One that no longer matches would
  // leave a length as it was in a slide otherwise magnified, and the picture would be wrong
  // without a word: so every place, extent, and type size there is must have been found.
  const there = (pattern: RegExp) => xml.match(pattern)?.length ?? 0;
  const missed =
    there(/<a:(off|chOff)\b/g) !== counted.place ||
    there(/<(a:ext|a:chExt|p:sldSz)\b(?! uri=)/g) !== counted.extent ||
    there(/\bsz="\d/g) !== counted.size ||
    there(/<a:(gridCol|tr)\b/g) !== counted.grid;
  if (missed) {
    throw new Error(
      "src/core/pptx-quicklook.ts no longer reads every length dekc pptx writes: teach magnified() the new form",
    );
  }
  return out;
}
