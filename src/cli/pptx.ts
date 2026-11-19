import type { Diagnostic, SkippedCheck } from "../core/diagnostic.ts";
import { DekError } from "../core/error.ts";
import { type PptxLifted, pptxDeck } from "../core/pptx.ts";
import { type PptxShot, pptxFromFile } from "../core/pptx-from.ts";
import { pptxSpecDeck } from "../core/pptx-spec.ts";
import type { DecksTarget } from "./scope.ts";

/**
 * One file per deck, a single deck included, as `dekc pdf` answers, and what each file laid
 * over its pictures, for the text output alone (`--json` is `outs`).
 */
export type PptxCliResult =
  | { action?: undefined; outs: string[]; lifted?: PptxLifted[] }
  | { action: "spec"; spec: string; start: string; slides: number; parts: number }
  | {
      action: "from";
      outs: string[];
      diagnostics: Diagnostic[];
      skipped?: SkippedCheck[];
      shots?: PptxShot[];
    };

export async function pptxCommand(
  { project, decks }: DecksTarget,
  options: { rootDist?: boolean; public?: boolean; from?: string; shot?: boolean } = {},
): Promise<Exclude<PptxCliResult, { action: "spec" }>> {
  if (options.from !== undefined) {
    const [deck, ...more] = decks;
    if (!deck || more.length > 0) {
      throw new DekError("--from writes one deck's PPTX", {
        hint: "name the deck: dekc pptx <deck> --from <file>",
      });
    }
    const done = await pptxFromFile({ project, deck }, options.from, {
      rootDist: options.rootDist,
      shot: options.shot,
    });
    return {
      action: "from",
      outs: [done.outPath],
      diagnostics: done.diagnostics,
      ...(done.skipped ? { skipped: done.skipped } : {}),
      ...(done.shots ? { shots: done.shots } : {}),
    };
  }
  const outs: string[] = [];
  const lifted: PptxLifted[] = [];
  for (const entry of decks) {
    const done = await pptxDeck(
      { project, deck: entry },
      { rootDist: options.rootDist, public: options.public },
    );
    outs.push(done.outPath);
    lifted.push(done.lifted);
  }
  return { outs, lifted };
}

/** `dekc pptx spec`: what an agent needs to build the deck again, for `--from`. */
export async function pptxSpecCommand(
  { project, decks }: DecksTarget,
  options: { public?: boolean } = {},
): Promise<PptxCliResult> {
  const [deck, ...more] = decks;
  if (!deck || more.length > 0) {
    throw new DekError("dekc pptx spec writes one deck's spec", {
      hint: "name the deck: dekc pptx <deck> spec",
    });
  }
  const done = await pptxSpecDeck({ project, deck }, { public: options.public });
  return { action: "spec", ...done };
}
