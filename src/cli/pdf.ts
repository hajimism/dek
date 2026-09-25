import { pdfDeck } from "../core/pdf.ts";
import { resolveDecks } from "./scope.ts";

/** One file per deck, a single deck included, so the shape never depends on the scope. */
export type PdfCliResult = { outs: string[] };

export async function pdfCommand(options: {
  cwd: string;
  deck?: string;
  rootDist?: boolean;
}): Promise<PdfCliResult> {
  const { project, decks } = resolveDecks(options.cwd, { deck: options.deck });
  const outs: string[] = [];
  for (const entry of decks) {
    outs.push((await pdfDeck({ project, deck: entry }, { rootDist: options.rootDist })).outPath);
  }
  return { outs };
}
