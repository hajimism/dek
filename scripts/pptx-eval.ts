/**
 * Measure what `dekc pptx` writes: each sample deck's file is written with this checkout, read
 * back as a recipient's PowerPoint would read it, and, on macOS, drawn by Quick Look and compared
 * with the browser line by line. Needs Playwright; never in CI, since the lines are measured in a
 * renderer only a Mac has.
 *
 *   bun scripts/pptx-eval.ts [--deck <dir>]... [--out <dir>] [--record <dir>] [--no-render]
 *
 * The report is .cache/pptx-eval/<time>/report.json and report.md, with each slide's pictures
 * beside them, unless --out says otherwise. --record also writes <dir>/<date>-v<version>.json,
 * each deck's numbers with no paths, to commit: evals/pptx/results/ keeps them.
 */
import { main } from "../evals/pptx/main.ts";

process.exitCode = await main(process.argv.slice(2));
