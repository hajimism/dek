import { pdfDeck } from "../core/pdf.ts";
import { trackDrawing, type Unsandboxed } from "../core/sandbox.ts";
import type { DecksTarget } from "./scope.ts";

/** One file per deck, a single deck included, so the shape never depends on the scope. */
export type PdfCliResult = { outs: string[]; unsandboxed?: Unsandboxed };

export async function pdfCommand(
  { project, decks }: DecksTarget,
  options: { rootDist?: boolean } = {},
): Promise<PdfCliResult> {
  const { value: outs, unsandboxed } = await trackDrawing(async () => {
    const built: string[] = [];
    for (const entry of decks) {
      built.push((await pdfDeck({ project, deck: entry }, { rootDist: options.rootDist })).outPath);
    }
    return built;
  });
  return { outs, ...(unsandboxed ? { unsandboxed } : {}) };
}
