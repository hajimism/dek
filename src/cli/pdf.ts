import { pdfDeck } from "../core/pdf.ts";
import { resolveDecks } from "./scope.ts";

export type PdfCliResult = { out: string } | { outs: string[] };

export async function pdfCommand(options: {
  cwd: string;
  deck?: string;
  rootDist?: boolean;
}): Promise<PdfCliResult> {
  const { project, deck, decks } = resolveDecks(options.cwd, { deck: options.deck });
  const outs: string[] = [];
  for (const entry of decks) {
    outs.push((await pdfDeck({ project, deck: entry }, { rootDist: options.rootDist })).outPath);
  }
  if (deck && outs[0]) {
    return { out: outs[0] };
  }
  return { outs };
}
