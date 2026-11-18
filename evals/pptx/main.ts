import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import pkg from "../../package.json";
import { importPlaywright } from "../../src/core/playwright.ts";
import { pptxDeck } from "../../src/core/pptx.ts";
import { asResolvedDeck } from "../../src/core/resolve.ts";
import { logicalSize } from "../../src/core/size.ts";
import { lastStop } from "../../src/core/step.ts";
import { loadSlideSources, renderSlideHtml } from "../../src/core/still-page.ts";
import { censusSlide } from "./census.ts";
import { compareInPage, coverageInPage } from "./compare.ts";
import { readPackage } from "./package.ts";
import { quickLookName, quickLookSlide } from "./quicklook.ts";
import { type DeckReport, type EvalReport, markdown, slideReport, summarize } from "./report.ts";

const USAGE =
  "bun scripts/pptx-eval.ts [--deck <dir>]... [--out <dir>] [--record <dir>] [--no-render]\n       bun scripts/pptx-eval.ts --deck <dir> --pptx <file> [--out <dir>] [--no-render]";

/** How many pixels of a comparison stand for one of the slide's: the scale `dekc pptx` shoots at. */
const SCALE = 2;

/**
 * Writes each deck's `.pptx` with this checkout, reads the file back, draws it in Quick Look where
 * there is one, and reports what it holds and how far it is from the browser; with --record, a
 * summary to commit. Exits 1 when a file is malformed.
 */
export async function main(argv: string[]): Promise<number> {
  let values: {
    deck?: string[];
    out?: string;
    record?: string;
    pptx?: string;
    "no-render"?: boolean;
    help?: boolean;
  };
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        deck: { type: "string", multiple: true },
        out: { type: "string" },
        record: { type: "string" },
        pptx: { type: "string" },
        "no-render": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (error) {
    console.error(`${(error as Error).message}\nusage: ${USAGE}`);
    return 2;
  }
  if (values.help) {
    console.log(`usage: ${USAGE}`);
    return 0;
  }
  // A file made elsewhere, such as one an agent built again, measured against its deck. It is
  // no record of dek's exporter, so it is never recorded.
  if (values.pptx !== undefined && (values.deck?.length !== 1 || values.record !== undefined)) {
    console.error(
      `--pptx measures one file against one --deck, and is not recorded\nusage: ${USAGE}`,
    );
    return 2;
  }
  const root = resolve(import.meta.dir, "../..");
  const samples = join(root, "sample/decks");
  const dirs = (
    values.deck ??
    readdirSync(samples)
      .map((name) => join(samples, name))
      .filter((dir) => statSync(dir).isDirectory())
  ).map((dir) => resolve(dir));
  const startedAt = new Date().toISOString();
  const out = resolve(
    values.out ?? join(root, ".cache/pptx-eval", startedAt.replace(/[:.]/g, "-")),
  );
  const renderer = values["no-render"] ? undefined : quickLookName();

  const playwright = await importPlaywright();
  const browser = await playwright.chromium.launch({ headless: true });
  const report: EvalReport = {
    startedAt,
    renderer: renderer ?? null,
    ...(values.pptx === undefined ? {} : { producer: resolve(values.pptx) }),
    decks: [],
  };
  try {
    const lab = await (await browser.newContext()).newPage();
    for (const dir of dirs) {
      const name = basename(dir);
      const folder = join(out, name);
      mkdirSync(folder, { recursive: true });
      const began = performance.now();
      const { outPath } =
        values.pptx === undefined ? await pptxDeck(dir) : { outPath: resolve(values.pptx) };
      const exportMs = performance.now() - began;
      const bytes = new Uint8Array(readFileSync(outPath));
      const { facts, files } = readPackage(bytes);

      const { deck } = asResolvedDeck(dir);
      const size = logicalSize(deck.deck.ratio);
      const sources = loadSlideSources(deck, { strict: true });
      const context = await browser.newContext({
        viewport: size,
        offline: true,
        deviceScaleFactor: SCALE,
      });
      const page = await context.newPage();
      const slides: DeckReport["slides"] = [];
      for (const [index, section] of deck.deck.sections.entries()) {
        const slide = facts.slides[index];
        if (!slide) {
          facts.problems.push(`the file has no slide for ${section.slug}`);
          continue;
        }
        const stem = join(folder, `${String(index + 1).padStart(2, "0")}-${section.slug}`);
        const shots = { full: `${stem}-browser.png`, bare: `${stem}-browser-bare.png` };
        const census = await censusSlide(
          page,
          renderSlideHtml(sources, section.slug, lastStop(section.beats)),
          shots,
        );
        let coverage = 0;
        for (const raster of slide.rasters) {
          const picture = files.get(raster);
          if (picture) {
            coverage = Math.max(
              coverage,
              await lab.evaluate(coverageInPage, { picture: dataUrl(picture) }),
            );
          }
        }
        let compared: Awaited<ReturnType<typeof compareInPage>> | undefined;
        if (renderer) {
          const drawn = [false, true].map((bare) => {
            const png = quickLookSlide(files, index, {
              bare,
              width: size.width * SCALE,
              dir: join(folder, "renderer"),
            });
            const kept = `${stem}-renderer${bare ? "-bare" : ""}.png`;
            if (png) {
              renameSync(png, kept);
            }
            return png ? kept : undefined;
          });
          const [full, bare] = drawn;
          if (full && bare) {
            compared = await lab.evaluate(compareInPage, {
              ...size,
              scale: SCALE,
              browser: {
                full: dataUrl(readFileSync(shots.full)),
                bare: dataUrl(readFileSync(shots.bare)),
              },
              renderer: { full: dataUrl(readFileSync(full)), bare: dataUrl(readFileSync(bare)) },
              lines: census.lines,
            });
            writeFileSync(
              `${stem}-ink.png`,
              Buffer.from(compared.overlay.replace(/^data:image\/png;base64,/, ""), "base64"),
            );
          } else {
            facts.problems.push(`${renderer} drew nothing for ${section.slug}`);
          }
        }
        slides.push(
          slideReport(section.slug, census, slide, {
            coverage,
            ...(compared
              ? {
                  lines: compared.lines,
                  difference: compared.difference,
                  differing: compared.differing,
                }
              : {}),
          }),
        );
      }
      await context.close();
      report.decks.push({
        deck: name,
        exportMs,
        bytes: facts.bytes,
        xmlBytes: facts.xmlBytes,
        mediaBytes: facts.mediaBytes,
        core: facts.core,
        problems: facts.problems,
        slides,
      });
      console.error(`${name}: ${slides.length} slides, ${(exportMs / 1000).toFixed(1)}s to write`);
    }
  } finally {
    await browser.close();
  }

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const text = markdown(report);
  writeFileSync(join(out, "report.md"), text);
  console.log(text);
  console.log(`report: ${join(out, "report.md")}`);
  if (values.record) {
    console.log(`record: ${writeRecord(resolve(values.record), report)}`);
  }
  return report.decks.some((deck) => deck.problems.length > 0) ? 1 : 0;
}

function dataUrl(png: Uint8Array): string {
  return `data:image/png;base64,${Buffer.from(png).toString("base64")}`;
}

/**
 * Writes the summaries into `dir` as `<date>-v<dek>.json`, or with `-2`, `-3`, … when a record of
 * that day and version is kept: no paths and no pictures, so it can be committed as it is.
 */
function writeRecord(dir: string, report: EvalReport): string {
  mkdirSync(dir, { recursive: true });
  const git = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"], { stderr: "ignore" });
  // What was measured is the exporter and the decks: a record of them changed says so.
  const changed =
    Bun.spawnSync(["git", "status", "--porcelain", "--", "src", "sample"], { stderr: "ignore" })
      .stdout.toString()
      .trim() !== "";
  const record = {
    dek: pkg.version,
    commit:
      git.exitCode === 0 ? `${git.stdout.toString().trim()}${changed ? "+changes" : ""}` : null,
    date: report.startedAt.slice(0, 10),
    renderer: report.renderer,
    decks: [
      ...report.decks.map((deck) => summarize([deck], deck.deck)),
      summarize(report.decks, "all"),
    ],
  };
  const stem = `${record.date}-v${record.dek}`;
  for (let count = 1; ; count++) {
    const path = join(dir, count === 1 ? `${stem}.json` : `${stem}-${count}.json`);
    try {
      writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }
}
