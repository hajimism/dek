import { clearMarks, listMarks, type MarkRow } from "../core/marks.ts";
import type { DeckTarget } from "./scope.ts";

export type MarksCliResult =
  | { action: "list"; marks: MarkRow[] }
  | { action: "clear"; cleared: number };

/** `dek marks`: the beats the speaker marked in the presenter view, where the script has them now. */
export async function marksCommand({ project, deck }: DeckTarget): Promise<MarksCliResult> {
  return { action: "list", marks: listMarks(project.root, deck) };
}

/** `dek marks clear`: drop the deck's marks, once they are dealt with. */
export async function clearMarksCommand({ project, deck }: DeckTarget): Promise<MarksCliResult> {
  return { action: "clear", cleared: clearMarks(project.root, deck) };
}
